# 01 — T3-catalog-schema: JSON-схема 44 атрибутов, карточка, версионирование

**What to build:** основа каталога — JSON-схема 44 атрибутов (CATALOG-MM) как источник истины (ADR-021), Prisma-модели ProductCard/DraftProposal, трёхъярусная обязательность, версионирование схемы additive-only.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] JSON-схема 44 атрибутов (8 групп CATALOG-MM) как TS-тип + валидация на уровне приложения (ADR-016); хранение атрибутов как Json в ProductCard/DraftProposal
- [ ] Трёхъярусная обязательность (ADR-021): A-ручные / A-авто / B-опциональные; блокирующий набор для Submitted = ярус A (все поля «Да»); фото и декларация НЕ блокируют Submitted
- [ ] `schemaVersion: Int` в атрибутах карточки и DraftProposal, старт = 1; additive-only эволюция; отсутствующий ключ в исторической карточке = null/«добор», не ошибка
- [ ] Breaking change через app-маппер v(n)→v(n+1) (модуль каталога, версионированные mapper-функции + реестр, unit-тесты); лениво — при правке карточки (новая версия по CAT-011)
- [ ] DB-миграция не трогает Json-семантику (только колоночные изменения)
- [ ] GET /templates/:productGroup генерирует xlsx на лету из схемы (per-product-group); дескриптор = productGroup+schemaVersion; golden-снапшот в fixtures/ для контрактных тестов
- [ ] Acceptance-тесты: (a) новое опциональное поле не ломает исторические карточки (v1 читается, поле=null, валидна); (b) breaking через маппер: v1 при правке → v2 с rename, несовместимое → «добор»; (c) schemaVersion в API-ответе карточки и DraftProposal
