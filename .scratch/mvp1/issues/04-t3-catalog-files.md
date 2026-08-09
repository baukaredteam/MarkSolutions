# 04 — T3-catalog-files: фото/файлы соответствия через StorageAdapter

**What to build:** загрузка/хранение фото товара (атрибут 32, ≥2) и файлов декларации соответствия (атрибуты 18–22) через StorageAdapter (ADR-015), безопасный доступ.

**Blocked by:** 01 (T3-catalog-schema)

**Status:** done (feat/t3-files)

- [x] Upload → StorageAdapter.write(buffer) → ключ; в атрибутах карточки дескриптор `[{key, originalName, mimeType, contentHash(sha256), uploadedAt, label}]` (label: front/back/declaration)
- [x] Reuse ключей при клоне/новой версии карточки (CAT-011) для неизменённых файлов; замена файла при правке → новый ключ, старая версия со старым ключом; физического удаления в MVP нет
- [x] Безопасный GET файла: tenant-доступ проверяется ЧЕРЕЗ карточку (card → tenant), сырой ключ сам по себе доступа не даёт (защита от IDOR, дух AT-16); негативный тест → 401/403
- [x] Валидация (ярус B): фото заполнены → ≥2 с разными label (front/back); дубликаты label → ошибка; декларация → согласованность дат + признак бессрочности
- [x] Acceptance: (a) upload → write → дескриптор с key+contentHash+label; (b) фото <2 или дубликаты label → ошибка валидации; (c) даты декларации несогласованы → ошибка валидации; (d) клон переиспользует ключи, замена → новый ключ, старая версия со старым; (e) GET без tenant-доступа → 401/403; (f) физического удаления файлов в MVP нет

**Реализация (feat/t3-files):** FilesService/FilesController в apps/api/src/files.controller.ts; StorageAdapter (существующий, T0) подключается как провайдер (STORAGE_DIR, default ./storage); POST /products/cards/:id/files (multipart), POST /products/cards/:id/clone (те же ключи), GET /products/cards/:id/files/:key (tenant через карточку → 403 IDOR / 401 без JWT); validateFiles + FileDescriptor в packages/shared/src/catalog-rules.ts; гейт яруса B подключён в ModerationService.validateForSubmit (фото ≥2, декларация — если файлы загружены). Тесты: shared 9, e2e 6 (всего 95/95 на ветке).

## /ocr-review 5929028 — LOW/заметки (не критично)

- **Clone и gtin**: `clone()` создаёт копию с `gtin: null` на карточке, но `attributes.gtin` (внутри Json) остаётся исходным. Если источник был Registered и clone попадёт на submit — GtinResolver увидит тот же gtin и, при REQUIRE_GS1_VERIFIED=true, может конфликтовать с уникальностью при регистрации. MVP: приемлемо (clone = новая версия, gtin перезапросится), но при связывании версий (CAT-011/CAT-011b) надо решить политику.
- **Upload без лимитов**: нет whitelist mime-типов и лимита размера (multer default 1MB? — нет, без ограничений). MVP: ок; перед прод добавить `limits: { fileSize }` и whitelist image/pdf.
- **x-tenant-id**: TenantGuard игнорирует header, tenant берётся из JWT (ADR-017) — покрыто тестом (onboarding.spec:115).
- **Path-traversal в :key**: `getFile` находит файл ТОЛЬКО среди дескрипторов карточки (NotFound если нет) + `LocalStorageAdapter.read` сам санитит (`..`, `/`, `\`, ведущая `.`) — двойная защита.
- **ContentHash**: `sha256(file.buffer)` от реального буфера; тест теперь утверждает точное значение `a5802267...` на известном содержимом (стабильность/дедуп-инвариант).
