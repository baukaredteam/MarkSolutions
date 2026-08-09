import { describe, it, expect } from "vitest";
import { validateFiles, FileDescriptor, FILE_LABELS } from "./catalog-rules";

const d = (
  label: FileDescriptor["label"],
  over: Partial<FileDescriptor> = {}
): FileDescriptor => ({
  key: `k-${label}-${Math.random()}`,
  originalName: "photo.jpg",
  mimeType: "image/jpeg",
  contentHash: "hash",
  uploadedAt: "2026-08-07T00:00:00.000Z",
  label,
  ...over,
});

describe("file descriptors (T3-files)", () => {
  it("FILE_LABELS = front|back|declaration", () => {
    expect(FILE_LABELS).toEqual(["front", "back", "declaration"]);
  });

  it("accepts ≥2 photos with distinct labels", () => {
    const r = validateFiles([d("front"), d("back")], {});
    expect(r.ok).toBe(true);
  });

  it("rejects <2 photos (only one photo)", () => {
    const r = validateFiles([d("front")], {});
    expect(r.ok).toBe(false);
    expect(r.errors.photos).toBeTruthy();
  });

  it("rejects duplicate labels (front+front)", () => {
    const r = validateFiles([d("front"), d("front")], {});
    expect(r.ok).toBe(false);
    expect(r.errors.photos).toMatch(/разн/i);
  });

  it("declaration without dates → error", () => {
    const r = validateFiles([d("front"), d("back"), d("declaration")], {
      declarationPerpetual: false,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.declaration).toBeTruthy();
  });

  it("declaration expiry < date → error", () => {
    const r = validateFiles([d("front"), d("back"), d("declaration")], {
      declarationDate: "2026-08-01",
      declarationExpiry: "2026-07-01",
      declarationPerpetual: false,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.declaration).toMatch(/раньш|позже|соглас/i);
  });

  it("declaration perpetual=true → date/expiry не обязательны", () => {
    const r = validateFiles([d("front"), d("back"), d("declaration")], {
      declarationPerpetual: true,
    });
    expect(r.ok).toBe(true);
  });

  it("declaration with consistent dates → ok", () => {
    const r = validateFiles([d("front"), d("back"), d("declaration")], {
      declarationDate: "2026-08-01",
      declarationExpiry: "2027-08-01",
      declarationPerpetual: false,
    });
    expect(r.ok).toBe(true);
  });

  it("no photos at all → error (фото ≥2 обязательны для файлов)", () => {
    const r = validateFiles([d("declaration")], {});
    expect(r.ok).toBe(false);
    expect(r.errors.photos).toBeTruthy();
  });
});
