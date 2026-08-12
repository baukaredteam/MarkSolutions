# 06c — UI-06c: billing (баланс, пополнение-drawer, проводки)

**Type:** task
**Status:** ready-for-agent
**Blocked by:** 02-ui-shell
**Оценка:** ≤ 1 день

**Источник:** docs/UI-SPEC.md §4.13, §6; docs/ui-reference.html.

**What to build:** Биллинг: баланс, пополнение-drawer (ref1c), таблица проводок лицевого счёта.

## Задачи

1. **Billing-страница** (§4.13):
   - KPI: Доступный баланс (`GET /billing/balance` → balance/reserved/available), Расходы за месяц, Лимит предупреждения.
   - «Пополнить баланс» (drawer): ref1c + сумма → `POST /billing/payments/import` (идемпотентно по ref1c: повтор → 200, первый → 201) → тост «Проведено/повтор».
   - Таблица операций лицевого счёта (LedgerEntry: TOPUP/RESERVE/RELEASE/SETTLE): Дата, Операция, Основание, Сумма, Баланс, Статус. Данные: `GET /billing/ledger` (нужен эндпоинт, если нет — добавить backend).
   - Роли: import → admin|accountant; balance GET → все клиентские.
2. **Backend (если нет)**: `GET /billing/ledger` — tenant-scoped LedgerEntry список desc. Тест.
3. **Дизайн**: KPI-карточки, dense-таблица, drawer-форма.

## Критерии

- Пополнение: первый ref1c → 201, повтор → 200 (идемпотентно).
- Проводки: реальные LedgerEntry (TOPUP/RESERVE/RELEASE/SETTLE), суммы целые тенге.
- e2e: billing topup + ledger сценарий; скриншот-сравнение.

## Регламент

worktree `feat/w4-ui-06c-billing` → TDD → /verification-before-completion → диф на текстовый review → мердж.
