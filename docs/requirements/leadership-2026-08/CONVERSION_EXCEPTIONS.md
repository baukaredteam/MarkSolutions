# Conversion Exceptions

**Date:** 2026-08-21

---

## Failed/Unsupported conversions

| ID | Original | Issue | Safe Next Action |
|----|----------|-------|-----------------|
| CONV-001 | source-021-interactive-prototype | AnyDoc unsupported: HTML interactive prototype | Static DOM/text extraction + visual review |
| CONV-002 | source-022-mockups-v2 | AnyDoc unsupported: HTML interactive mockup | Static DOM/text extraction + visual review |

## Notes

- 20/22 files converted via AnyDoc; 2 HTML prototypes unsupported.
- Converted files in `.local/leadership-intake/` (gitignored).
- No raw content copied to Git.

## Appendix: HTML Prototype Handling

HTML prototypes (LEAD-021, LEAD-022) must be handled locally only:

1. **Static extraction only.** Use browser DevTools or `node` DOM parser to extract text, headings, and structure. Never execute embedded JavaScript.
2. **Visual review required.** Before any UI behavior from the prototypes becomes an `MF-REQ`, a human must review the visual design in a browser.
3. **No raw HTML in Git.** Extracted text goes to `.local/leadership-intake/` (gitignored). Only sanitized derived artifacts are committed.
4. **Reference linkage.** Any `MF-REQ` derived from a prototype must reference `LEAD-021` or `LEAD-022` plus the extracted section/heading.
5. **No executable content.** Do not copy, install, or serve the HTML files. Do not follow embedded links to external services.
