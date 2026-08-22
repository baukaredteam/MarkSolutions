# Raw Source Handling Policy

**Applies to:** All leadership originals and AnyDoc conversions
**Repository visibility:** Public

---

## Rules

1. **Originals stay local.** Raw source files (`.docx`, `.pptx`, `.xlsx`, `.pdf`, `.html`) and their AnyDoc markdown conversions live in `.local/leadership-intake/` or `.local/anydoc-output/`. These directories are gitignored and must never be staged or committed.

2. **`git check-ignore -v` before extraction.** Before copying any file into the repo tree, verify it is covered by a `.gitignore` rule. If the file is not ignored, do not proceed.

3. **Public Git receives sanitized derived artifacts only.** Committed files under `docs/` contain:
   - IDs and SHA-256 hashes of originals (never raw filenames identifying vendors/customers/samples)
   - Extracted requirements with LEAD source references (never copied confidential paragraphs)
   - Sanitized decision records and gap reports

4. **No execution of embedded scripts.** HTML prototypes and any files with executable content must be handled as static DOM/text extraction only. Never run JavaScript from source documents.

5. **Confidentiality flag.** Every row in `SOURCE_MANIFEST.md` carries a `Confidential` flag. Until leadership explicitly approves public disclosure of a source filename, the committed reference uses neutral titles (e.g., `source-020-invoice-sample`).

6. **Verification.** Run `git check-ignore -v .local/leadership-intake/` and `git status --ignored` before any extraction to confirm the ignore rules are active.
