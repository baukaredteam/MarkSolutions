# 06 — UI-06a: labels (печать/reprint, PNG-превью, очередь печати)

**Type:** task
**Status:** ready-for-agent
**Blocked by:** 02-ui-shell
**Оценка:** ≤ 1 день

**Источник:** docs/UI-SPEC.md §4.8, §6; docs/ui-reference.html.

**What to build:** Этикетки: список кодов заказа с печатью/перепечаткой, PNG-превью, очередь печати.

## Задачи

1. **Labels-страница** (§4.8):
   - Список кодов заказа (`GET /codes/:orderId/codes`) с кнопками «Печать» / «Перепечатать».
   - «Печать» → `POST /labels/:codeKey/print` → PNG-превью `<img data:image/png;base64>`.
   - «Перепечатать» → модалка причины (reasonCode: PRINT_DEFECT/DAMAGED_BEFORE_APPLY/LOST_LABEL/OTHER; OTHER→comment≥5) → `POST /labels/:codeKey/reprint` → тот же key (content-addressed) + аудит-тост.
   - Очередь печати: статусы заданий (pending/done) — на основе labelKey/labelKeyFor, без серверной очереди (эволюция LBL-038).
   - Роли: admin|manager|marking (403 для viewer/warehouse/accountant).
2. **Дизайн**: плотная таблица (EntityList v2), hover-строки, badges статусов кода.

## Критерии

- Печать: PNG-превью; reprint требует причину (400 при пустой), APPLIED → 409 тост.
- e2e: labels print + reprint сценарий; скриншот-сравнение.

## Регламент

worktree `feat/w4-ui-06-labels` → TDD → /verification-before-completion → диф на текстовый review → мердж.
