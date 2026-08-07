// Минимальный XLSX-генератор (Ponytail): ZIP stored (без deflate), sheet1.xml + [Content_Types].
// Достаточно для GET /templates/:productGroup в MVP. Прод — exceljs, когда понадобятся
// формулы/стили. ponytail: minimal zip, add compression when files > 100KB matter.
import {
  motorOilSchemaV1,
  REFERENCES,
  type CatalogSchema,
  type AttributeDef,
} from "./catalog-schema.js";

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function zip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length + f.data.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true); // version
    dv.setUint16(6, 0, true); // flags
    dv.setUint16(8, 0, true); // stored
    dv.setUint32(14, crc, true);
    dv.setUint32(18, f.data.length, true);
    dv.setUint32(22, f.data.length, true);
    dv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(f.data, 30 + name.length);
    chunks.push(local);
    // central dir entry
    const c = new Uint8Array(46 + name.length);
    const cdv = new DataView(c.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, f.data.length, true);
    cdv.setUint32(24, f.data.length, true);
    cdv.setUint16(28, name.length, true);
    cdv.setUint32(42, offset, true);
    c.set(name, 46);
    central.push(c);
    offset += local.length;
  }
  const centralStart = chunks.reduce((a, c) => a + c.length, 0);
  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(8, files.length, true);
  edv.setUint16(10, files.length, true);
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, centralStart, true);
  const all = [...chunks, ...central, eocd];
  const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Чистая модель листа (F2): дескриптор + заголовки. Рендер xlsx строится из неё.
export interface SheetModel {
  descriptor: {
    productGroup: string;
    schemaVersion: number;
    generatedAt: string;
  };
  headers: { label: string; required: boolean }[];
}

export function sheetModel(
  schema: CatalogSchema,
  generatedAt = new Date()
): SheetModel {
  return {
    descriptor: {
      productGroup: schema.productGroup,
      schemaVersion: schema.schemaVersion,
      generatedAt: generatedAt.toISOString(),
    },
    headers: schema.attributes.map((a: AttributeDef) => ({
      label: a.label,
      required: a.required,
    })),
  };
}

function renderSheet(model: SheetModel): string {
  // заголовок: ярус A (required) помечен «*», остальные без
  const headers = model.headers.map(
    (h) => `${xmlEscape(h.label)}${h.required ? "*" : ""}`
  );
  const rows: string[][] = [headers, []];
  const sheet = rows
    .map(
      (r, i) =>
        `<row r="${i + 1}">${r
          .map(
            (c: string, ci: number) =>
              `<c r="${String.fromCharCode(65 + ci)}${i + 1}" t="inlineStr"><is><t>${xmlEscape(c)}</t></is></c>`
          )
          .join("")}</row>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${sheet}</worksheet>`;
}

export function buildMotorOilTemplate(): Buffer {
  const model = sheetModel(motorOilSchemaV1);
  const sheet = renderSheet(model);
  const enc = new TextEncoder();
  const zipBuf = zip([
    {
      name: "[Content_Types].xml",
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`),
    },
    {
      name: "_rels/.rels",
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    },
    {
      name: "xl/workbook.xml",
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="motor-oils-v1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`),
    },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheet) },
  ]);
  return Buffer.from(zipBuf);
}

export function templateFor(group: string): Buffer | null {
  if (group === "motor-oils") return buildMotorOilTemplate();
  return null;
}

export const TEMPLATE_REFERENCES = REFERENCES;
export { motorOilSchemaV1 };
