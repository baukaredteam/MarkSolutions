import { describe, it, expect } from "vitest";
import {
  EnvelopeCodec,
  EnvelopeError,
  canonicalAadBytes,
  DekWrapper,
  EnvelopeMeta,
  MFV1_MAGIC,
} from "./envelope-codec";

function fakeWrapper(
  overrides?: Partial<{ keyVersion: number }>
): DekWrapper & {
  wrapped: Buffer;
  keyVersion: number;
} {
  const keyVersion = overrides?.keyVersion ?? 7;
  return {
    keyVersion,
    wrapped: Buffer.from(`vault:v${keyVersion}:AAAA`),
    async wrap(dek: Buffer) {
      // fake: "wrap" = base64 (mirrors OpenBao transit), key version returned
      return { wrapped: Buffer.from(dek.toString("base64")), keyVersion };
    },
    async unwrap(wrapped: Buffer) {
      return { dek: Buffer.from(wrapped.toString(), "base64"), keyVersion };
    },
  };
}

const meta: EnvelopeMeta = {
  organizationId: "org-1",
  legalEntityId: "le-1",
  objectId: "code-1",
};

describe("EnvelopeCodec (MFV1)", () => {
  it("roundtrips plaintext through seal/open", async () => {
    const codec = new EnvelopeCodec("markflow-local");
    const wrap = fakeWrapper();
    const payload = Buffer.from(
      JSON.stringify({ serial: "9000001", ai91: null, ai92: null })
    );
    const envelope = await codec.seal(payload, meta, wrap);
    expect(envelope.subarray(0, 4).toString("ascii")).toBe("MFV1");
    const out = await codec.open(envelope, meta, wrap);
    expect(out.equals(payload)).toBe(true);
  });

  it("rejects malformed (too short) encoding", async () => {
    const codec = new EnvelopeCodec("markflow-local");
    await expect(
      codec.open(Buffer.from("MFV1"), meta, fakeWrapper())
    ).rejects.toThrow(EnvelopeError);
  });

  it("rejects bad magic", async () => {
    const codec = new EnvelopeCodec("markflow-local");
    const wrap = fakeWrapper();
    const env = await codec.seal(Buffer.from("x"), meta, wrap);
    env.write("XXXX", 0);
    await expect(codec.open(env, meta, wrap)).rejects.toThrow(/magic/);
  });

  it("rejects unknown format version", async () => {
    const codec = new EnvelopeCodec("markflow-local");
    const wrap = fakeWrapper();
    const env = await codec.seal(Buffer.from("x"), meta, wrap);
    env.writeUInt8(99, MFV1_MAGIC.length);
    await expect(codec.open(env, meta, wrap)).rejects.toThrow(/format version/);
  });

  it("rejects unknown algorithm", async () => {
    const codec = new EnvelopeCodec("markflow-local");
    const wrap = fakeWrapper();
    const env = await codec.seal(Buffer.from("x"), meta, wrap);
    env.writeUInt8(99, MFV1_MAGIC.length + 1);
    await expect(codec.open(env, meta, wrap)).rejects.toThrow(/algorithm/);
  });

  it("rejects metadata mismatch (different scope on open)", async () => {
    const codec = new EnvelopeCodec("markflow-local");
    const wrap = fakeWrapper();
    const env = await codec.seal(Buffer.from("secret"), meta, wrap);
    await expect(
      codec.open(env, { ...meta, legalEntityId: "le-2" }, wrap)
    ).rejects.toThrow(/metadata mismatch/);
  });

  it("rejects cross-organization open (different organizationId)", async () => {
    const codec = new EnvelopeCodec("markflow-local");
    const wrap = fakeWrapper();
    const env = await codec.seal(Buffer.from("secret"), meta, wrap);
    await expect(
      codec.open(env, { ...meta, organizationId: "org-2" }, wrap)
    ).rejects.toThrow(/metadata mismatch/);
  });

  it("rejects altered ciphertext (tag failure)", async () => {
    const codec = new EnvelopeCodec("markflow-local");
    const wrap = fakeWrapper();
    const env = await codec.seal(Buffer.from("secret"), meta, wrap);
    const last = env.length - 1;
    env[last] = env[last] ^ 0xff;
    await expect(codec.open(env, meta, wrap)).rejects.toThrow();
  });

  it("rejects wrong key version returned by unwrap", async () => {
    const codec = new EnvelopeCodec("markflow-local");
    const wrap = fakeWrapper({ keyVersion: 7 });
    const env = await codec.seal(Buffer.from("secret"), meta, wrap);
    const wrongWrap = fakeWrapper({ keyVersion: 8 });
    await expect(codec.open(env, meta, wrongWrap)).rejects.toThrow(
      /key version mismatch/
    );
  });

  it("rejects missing key version (zero)", async () => {
    const codec = new EnvelopeCodec("markflow-local");
    const wrap = fakeWrapper();
    const env = await codec.seal(Buffer.from("secret"), meta, wrap);
    // locate keyVersion offset: magic(4) + ver(1) + algo(1) + metaVer(2) + keyNameLen(2) + keyName(n)
    const keyNameLen = env.readUInt16BE(8);
    const keyVersionOffset = 4 + 1 + 1 + 2 + 2 + keyNameLen;
    env.writeUInt32BE(0, keyVersionOffset);
    await expect(codec.open(env, meta, wrap)).rejects.toThrow(
      /missing key version/
    );
  });

  it("rejects trailing bytes", async () => {
    const codec = new EnvelopeCodec("markflow-local");
    const wrap = fakeWrapper();
    const env = await codec.seal(Buffer.from("secret"), meta, wrap);
    const padded = Buffer.concat([env, Buffer.from("GARBAGE")]);
    await expect(codec.open(padded, meta, wrap)).rejects.toThrow(
      /trailing bytes/
    );
  });

  it("canonical AAD is deterministic and byte-exact", () => {
    const a = canonicalAadBytes(meta);
    const b = canonicalAadBytes({ ...meta });
    expect(a.equals(b)).toBe(true);
    const c = canonicalAadBytes({ ...meta, objectId: "code-2" });
    expect(a.equals(c)).toBe(false);
  });
});
