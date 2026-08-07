# 03 — T3-catalog-moderation: машина модерации, GtinResolver, NktAdapter

**What to build:** машина состояний карточки (CAT-013, §8.2 ТЗ), трёхслойный GtinResolver, NktAdapter (мок) с асинхронной регистрацией и reconciliation.

**Blocked by:** 02 (T3-catalog-import)

**Status:** ready-for-agent

- [ ] Машина модерации ProductCard: Draft→Validating→Submitted→In Review→Approved/Rejected→Registering→Registered (CAT-013); статусы String (ADR-016)
- [ ] Роль модератора — seeded `operator@markflow` (отдельная от админа клиента); очередь Submitted/In Review по всем tenant, фильтр по tenant; все переходы аудируются (автор/время/комментарий)
- [ ] Отклонение — причина на уровне поля (machine-readable `fieldReasons` в Json карточки): предопределённый список причин → конкретные атрибуты + опциональный комментарий; отклонённая → Rejected
- [ ] GtinResolver трёхслойный (Q6): кэш (gtin_cache: seed RAVENOL 04014835723399 + 04870267100135 из codes_success, status=VERIFIED, source=seed) → IGs1Adapter.verify (мок; mod10-проверка контрольной цифры GTIN-14, невалидный → REJECTED, валидный → PENDING_REAL) → ручной ввод (source=manual + метка UI)
- [ ] Registering НЕ требует VERIFIED в MVP-1: разрешён с PENDING_REAL и manual, карточка получает бейдж «GTIN не верифицирован GS1» + задача сверки (ID-017); конфиг-флаг REQUIRE_GS1_VERIFIED_FOR_REGISTERING (default false)
- [ ] Синхронизация кэша: в MVP-1 без опроса; после доступа — daily cron, расхождения → задача оператору (ID-017), без молчаливых перезаписей; critical расхождение («не существует»/«не принадлежит») блокирует НОВЫЕ заказы КМ по карточке
- [ ] NktAdapter (мок) submitProduct + getStatus; Registering→Registered асинхронно (мок ~3s → SUCCESS); reconciliation: НКТ не ответил в SLA → задача на дашборд исключений оператора; отказ → Registration Failed с field-level ошибками → Needs Correction
- [ ] Acceptance: (a) кэш VERIFIED → OK без мока, REJECTED → отказ; (b) валидный формат без кэша → PENDING_REAL, Registering с бейджем; (c) manual → source=manual + метка + задача сверки; (d) невалидный mod10 → REJECTED, отправка заблокирована; (e) флаг=true → Registering требует VERIFIED; (f) critical расхождение блокирует новые заказы КМ; внешний отказ (п.16) → Registration Failed → Needs Correction
