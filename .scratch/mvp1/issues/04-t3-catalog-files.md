# 04 — T3-catalog-files: фото/файлы соответствия через StorageAdapter

**What to build:** загрузка/хранение фото товара (атрибут 32, ≥2) и файлов декларации соответствия (атрибуты 18–22) через StorageAdapter (ADR-015), безопасный доступ.

**Blocked by:** 01 (T3-catalog-schema)

**Status:** done (feat/t3-files)

- [x] Upload → StorageAdapter.write(buffer) → ключ; в атрибутах карточки дескриптор `[{key, originalName, mimeType, contentHash(sha256), uploadedAt, label}]` (label: front/back/declaration)
- [x] Reuse ключей при клоне/новой версии карточки (CAT-011) для неизменённых файлов; замена файла при правке → новый ключ, старая версия со старым ключом; физического удаления в MVP нет
- [x] Безопасный GET файла: tenant-доступ проверяется ЧЕРЕЗ карточку (card → tenant), сырой ключ сам по себе доступа не даёт (защита от IDOR, дух AT-16); негативный тест → 401/403
- [x] Валидация (ярус B): фото заполнены → ≥2 с разными label (front/back); дубликаты label → ошибка; декларация → согласованность дат + признак бессрочности
- [x] Acceptance: (a) upload → write → дескриптор с key+contentHash+label; (b) фото <2 или дубликаты label → ошибка валидации; (c) даты декларации несогласованы → ошибка валидации; (d) клон переиспользует ключи, замена → новый ключ, старая версия со старым; (e) GET без tenant-доступа → 401/403; (f) физического удаления файлов в MVP нет

**Реализация (feat/t3-files):** FilesService/FilesController в apps/api/src/files.controller.ts; StorageAdapter (существующий, T0) подключается как провайдер (STORAGE_DIR, default ./storage); POST /products/cards/:id/files (multipart), POST /products/cards/:id/clone (те же ключи), GET /products/cards/:id/files/:key (tenant через карточку → 403 IDOR / 401 без JWT); validateFiles + FileDescriptor в packages/shared/src/catalog-rules.ts; гейт яруса B подключён в ModerationService.validateForSubmit (фото ≥2, декларация — если файлы загружены). Тесты: shared 9, e2e 5 (всего 94/94 на ветке).
