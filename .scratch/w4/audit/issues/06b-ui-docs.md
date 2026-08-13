# 06b — UI-06b: documents (import + withdrawal мастера)

**Type:** task
**Status:** ready-for-agent
**Blocked by:** 02-ui-shell
**Оценка:** ≤ 1 день

**Источник:** docs/UI-SPEC.md §4.11, §6; docs/ui-reference.html.

**What to build:** Документы: таблица + мастера «Оформить ввоз» (ДТ) и «Вывод/списание» (тип/причина/childrenWriteOff).

## Задачи

1. **Documents-страница** (§4.11):
   - Таблица (`GET /documents` — IMPORT|WITHDRAWAL|UTILISATION, sort desc): ID, Тип, Статус, Причина отказа, Дата.
   - Мастер «Оформить ввоз»: orderId (из GET /orders) + ДТ {date, number, authorityCode?} → `POST /import` → SUCCESS → тост «INTRODUCED».
   - Мастер «Вывод/списание»: codes[], withdrawalType (WITHDRAWAL|WRITE_OFF), withdrawalReason (словарик DEFECT/LOST/EXPIRY/RETURN_SUPPLIER/DESTRUCTION/OTHER; OTHER→comment≥5), childrenWriteOff (toggle), primaryDocument (опц.) → `POST /withdrawal` → SUCCESS → тост «WITHDRAWN/WRITTEN_OFF».
   - Роли: import/withdrawal → admin|manager|marking.
2. **Дизайн**: EntityList v2, мастера 4 шага (Основание→Коды→Проверка→Отправка), notice-подсказки.

## Критерии

- import: без date+number → 400 тост; дубль номера → 409.
- withdrawal: OTHER без comment → 400; член активного агрегата → 409.
- e2e: import + withdrawal сценарий; скриншот-сравнение.

## Регламент

worktree `feat/w4-ui-06b-docs` → TDD → /verification-before-completion → диф на текстовый review → мердж.

## Tech-debt (LOW)

- `docs.spec.tsx`: flaky ассерт на текст «Завершён» (множественный match — SUCCESS×2 badge) — заменить `getByText` на селектор по `data-status` (`[data-status="SUCCESS"]`) или `getAllByRole`. Не блокер, тест зелёный.
