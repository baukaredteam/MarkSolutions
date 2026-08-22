import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// W0-03a — MFV1 envelope codec (deep module).
//
// Pure: no network, no filesystem, no DI. The only I/O is delegated through
// the injected DekWrapper so that wrap/unwrap (OpenBao Transit) is a seam the
// adapter owns. Unit tests drive this module with a fake DekWrapper to cover
// malformed / tampered / scope-mismatch cases without any external service.
//
// Envelope layout (all integers big-endian, no inferred field boundaries):
//   magic          4  "MFV1"
//   formatVersion  1  u8   = 1
//   algorithm      1  u8   = 1 (AES-256-GCM)
//   metadataVer    2  u16  = 1
//   keyNameLen     2  u16
//   keyName        N  utf8
//   keyVersion     4  u32
//   nonce          12 fixed
//   tag            16 fixed
//   aadHash        32 fixed  (SHA-256 of canonical AAD)
//   createdAt      8  u64 (epoch ms)
//   wrappedDekLen  4  u32
//   wrappedDek     N
//   ciphertextLen  4  u32
//   ciphertext     N
//
// Canonical AAD (the bytes passed to cipher.setAAD / decipher.setAAD) is a
// deterministic length-prefixed sequence of exactly:
//   u16 len(organizationId) || organizationId
//   u16 len(legalEntityId)   || legalEntityId
//   u16 len(objectId)        || objectId
//   u8  formatVersion
//   u8  algorithm
// ─────────────────────────────────────────────────────────────────────────────

export const MFV1_MAGIC = Buffer.from("MFV1", "ascii");
export const FORMAT_VERSION = 1;
export const ALGO_AES_256_GCM = 1;
export const METADATA_VERSION = 1;

const NONCE_LEN = 12;
const TAG_LEN = 16;
const AAD_HASH_LEN = 32;
const DEK_LEN = 32;
const FIXED_HEADER = MFV1_MAGIC.length + 1 + 1 + 2; // magic + version + algo + metadataVer

export interface EnvelopeMeta {
  organizationId: string;
  legalEntityId: string;
  objectId: string;
}

/** DEK wrap/unwrap seam — implemented by the OpenBao transit adapter. */
export interface DekWrapper {
  wrap(
    dek: Buffer,
    keyName: string
  ): Promise<{ wrapped: Buffer; keyVersion: number }>;
  unwrap(
    wrapped: Buffer,
    keyName: string
  ): Promise<{ dek: Buffer; keyVersion: number }>;
}

export function canonicalAadBytes(meta: EnvelopeMeta): Buffer {
  const org = Buffer.from(meta.organizationId, "utf8");
  const le = Buffer.from(meta.legalEntityId, "utf8");
  const obj = Buffer.from(meta.objectId, "utf8");
  const out = Buffer.alloc(
    2 + org.length + 2 + le.length + 2 + obj.length + 1 + 1
  );
  let o = 0;
  out.writeUInt16BE(org.length, o);
  o += 2;
  org.copy(out, o);
  o += org.length;
  out.writeUInt16BE(le.length, o);
  o += 2;
  le.copy(out, o);
  o += le.length;
  out.writeUInt16BE(obj.length, o);
  o += 2;
  obj.copy(out, o);
  o += obj.length;
  out.writeUInt8(FORMAT_VERSION, o);
  o += 1;
  out.writeUInt8(ALGO_AES_256_GCM, o);
  o += 1;
  return out;
}

export class EnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvelopeError";
  }
}

function assertScope(meta: EnvelopeMeta): void {
  for (const [name, v] of [
    ["organizationId", meta.organizationId],
    ["legalEntityId", meta.legalEntityId],
    ["objectId", meta.objectId],
  ] as const) {
    if (!v || v.trim() === "") throw new EnvelopeError(`${name} is required`);
  }
}

export class EnvelopeCodec {
  constructor(private readonly keyName: string) {
    if (!keyName || keyName.trim() === "")
      throw new EnvelopeError("keyName is required");
  }

  async seal(
    plaintext: Buffer,
    meta: EnvelopeMeta,
    wrap: DekWrapper
  ): Promise<Buffer> {
    assertScope(meta);
    const dek = randomBytes(DEK_LEN);
    const nonce = randomBytes(NONCE_LEN);
    try {
      const aad = canonicalAadBytes(meta);
      const cipher = createCipheriv("aes-256-gcm", dek, nonce);
      cipher.setAAD(aad);
      const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const tag = cipher.getAuthTag();

      const { wrapped, keyVersion } = await wrap.wrap(dek, this.keyName);
      if (!Number.isInteger(keyVersion) || keyVersion <= 0) {
        throw new EnvelopeError(`invalid keyVersion: ${keyVersion}`);
      }
      const aadHash = createHash("sha256").update(aad).digest();
      const createdAt = BigInt(Date.now());

      return this.encode({
        wrappedDek: wrapped,
        keyVersion,
        nonce,
        tag,
        ciphertext: enc,
        aadHash,
        createdAt,
      });
    } finally {
      dek.fill(0);
      nonce.fill(0);
    }
  }

  async open(
    envelope: Buffer,
    meta: EnvelopeMeta,
    unwrap: DekWrapper
  ): Promise<Buffer> {
    assertScope(meta);
    const parts = this.decode(envelope);

    const aad = canonicalAadBytes(meta);
    const expectedHash = createHash("sha256").update(aad).digest();
    if (!parts.aadHash.equals(expectedHash)) {
      throw new EnvelopeError(
        "metadata mismatch — scope or object identity differs"
      );
    }
    if (parts.keyVersion <= 0) {
      throw new EnvelopeError("missing key version");
    }

    const { dek, keyVersion } = await unwrap.unwrap(
      parts.wrappedDek,
      this.keyName
    );
    try {
      if (keyVersion !== parts.keyVersion) {
        throw new EnvelopeError(
          `key version mismatch: envelope=${parts.keyVersion} unwrap=${keyVersion}`
        );
      }
      const decipher = createDecipheriv("aes-256-gcm", dek, parts.nonce);
      decipher.setAAD(aad);
      decipher.setAuthTag(parts.tag);
      // throws on tag/ciphertext tamper
      return Buffer.concat([
        decipher.update(parts.ciphertext),
        decipher.final(),
      ]);
    } finally {
      dek.fill(0);
    }
  }

  private encode(p: {
    wrappedDek: Buffer;
    keyVersion: number;
    nonce: Buffer;
    tag: Buffer;
    ciphertext: Buffer;
    aadHash: Buffer;
    createdAt: bigint;
  }): Buffer {
    const keyName = Buffer.from(this.keyName, "utf8");
    const total =
      FIXED_HEADER +
      2 +
      keyName.length +
      4 +
      NONCE_LEN +
      TAG_LEN +
      AAD_HASH_LEN +
      8 +
      4 +
      p.wrappedDek.length +
      4 +
      p.ciphertext.length;
    const out = Buffer.alloc(total);
    let o = 0;

    MFV1_MAGIC.copy(out, o);
    o += MFV1_MAGIC.length;
    out.writeUInt8(FORMAT_VERSION, o);
    o += 1;
    out.writeUInt8(ALGO_AES_256_GCM, o);
    o += 1;
    out.writeUInt16BE(METADATA_VERSION, o);
    o += 2;
    out.writeUInt16BE(keyName.length, o);
    o += 2;
    keyName.copy(out, o);
    o += keyName.length;
    out.writeUInt32BE(p.keyVersion, o);
    o += 4;
    p.nonce.copy(out, o);
    o += NONCE_LEN;
    p.tag.copy(out, o);
    o += TAG_LEN;
    p.aadHash.copy(out, o);
    o += AAD_HASH_LEN;
    out.writeBigUInt64BE(p.createdAt, o);
    o += 8;
    out.writeUInt32BE(p.wrappedDek.length, o);
    o += 4;
    p.wrappedDek.copy(out, o);
    o += p.wrappedDek.length;
    out.writeUInt32BE(p.ciphertext.length, o);
    o += 4;
    p.ciphertext.copy(out, o);
    o += p.ciphertext.length;

    return out;
  }

  private decode(buffer: Buffer): {
    wrappedDek: Buffer;
    keyVersion: number;
    nonce: Buffer;
    tag: Buffer;
    ciphertext: Buffer;
    aadHash: Buffer;
    createdAt: bigint;
  } {
    if (!Buffer.isBuffer(buffer) || buffer.length < FIXED_HEADER) {
      throw new EnvelopeError("envelope too short");
    }
    let o = 0;
    if (!buffer.subarray(o, o + MFV1_MAGIC.length).equals(MFV1_MAGIC)) {
      throw new EnvelopeError("invalid magic");
    }
    o += MFV1_MAGIC.length;

    const formatVersion = buffer.readUInt8(o);
    o += 1;
    if (formatVersion !== FORMAT_VERSION)
      throw new EnvelopeError(`unknown format version: ${formatVersion}`);
    const algorithm = buffer.readUInt8(o);
    o += 1;
    if (algorithm !== ALGO_AES_256_GCM)
      throw new EnvelopeError(`unknown algorithm: ${algorithm}`);
    const metadataVer = buffer.readUInt16BE(o);
    o += 2;
    if (metadataVer !== METADATA_VERSION)
      throw new EnvelopeError(`unknown metadata version: ${metadataVer}`);

    const readU16 = () => {
      const v = buffer.readUInt16BE(o);
      o += 2;
      return v;
    };
    const readBytes = (n: number) => {
      const v = buffer.subarray(o, o + n);
      o += n;
      return v;
    };

    const keyNameLen = readU16();
    const keyName = readBytes(keyNameLen).toString("utf8");
    if (keyName !== this.keyName)
      throw new EnvelopeError(`key name mismatch: ${keyName}`);

    const keyVersion = buffer.readUInt32BE(o);
    o += 4;
    const nonce = readBytes(NONCE_LEN);
    const tag = readBytes(TAG_LEN);
    const aadHash = readBytes(AAD_HASH_LEN);
    const createdAt = buffer.readBigUInt64BE(o);
    o += 8;

    const wrappedDekLen = buffer.readUInt32BE(o);
    o += 4;
    if (wrappedDekLen <= 0)
      throw new EnvelopeError("envelope missing wrapped DEK");
    const wrappedDek = readBytes(wrappedDekLen);

    const ciphertextLen = buffer.readUInt32BE(o);
    o += 4;
    if (ciphertextLen <= 0)
      throw new EnvelopeError("envelope missing ciphertext");
    const ciphertext = readBytes(ciphertextLen);

    if (o !== buffer.length)
      throw new EnvelopeError("trailing bytes after envelope");

    return {
      wrappedDek,
      keyVersion,
      nonce,
      tag,
      ciphertext,
      aadHash,
      createdAt,
    };
  }
}
