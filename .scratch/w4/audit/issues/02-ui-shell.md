# 02 — UI-01 shell: дизайн-система + каркас приложения

**Type:** task
**Status:** ready-for-agent
**Blocked by:** 01-rbac (roles в login)
**Оценка:** ≤ 1 день

**Источник:** docs/UI-SPEC.md §1-3, §8; docs/ui-reference.html.

**What to build:** каркас фронт-пересборки: дизайн-система по токенам §2, sidebar/topbar/role-switch/Ctrl+K/tour, роутер, stub-страницы для всех 23 nav-item.

**Данные ТОЛЬКО из реального API. e2e-сценарий экрана. Скриншот-сравнение с ui-reference.html.**

## Задачи

1. **Дизайн-токены** (§2 UI-SPEC): CSS-переменные `--navy/--blue/--bg/--card/--line/--text/--muted/--green/--yellow/--red/--violet/--shadow/--r/--side` + компоненты (btn, badge, kpi, table, tabs, drawer, modal, toast, process-step, wizard-step, command-palette, tour-tip). Перенести из ui-reference.html в `apps/web/src/` (CSS/SCSS).
2. **Layout**: sidebar (23 nav-item, группы), topbar (breadcrumb, глобальный поиск, role-switch, ⌘, ⚠, 🔔, профиль), mobile-menu (900px).
3. **Роутер**: `/dashboard`, `/codecheck`, `/products`, `/productDetail`, `/orders`, `/vault`, `/labels`, `/operations`, `/warehouse`, `/documents`, `/reports`, `/billing`, `/integrations`, `/support`, `/organization`, `/operator`, `/audit`, `/tasks`, `/production`, `/partners`, `/processes`, `/exceptions`, `/health`. Все → компоненты (реальные или stub).
4. **Stub-страницы** для нереализованных экранов (production, partners, processes, health, reports-агрегаты, support, operations, warehouse, integrations): бейдж «Эволюция» (не блокирует).
5. **Роли** (§3.2 → финальный словарь): admin/manager/accountant/marking/warehouse/viewer + operator. role-switch переключает nav-visibility по `roles[]` из JWT. Матрица §7.
6. **Ctrl+K** command-palette (14 команд) + **tour** (5 шагов, sessionStorage).
7. **Login**: реальный `POST /auth/login` → сохранить `roles[]` + tenantId в session; демо-креды из seed.

## Критерии

- Скриншот-сравнение shell с ui-reference.html (login, sidebar, topbar, dashboard-stub).
- e2e: login → роли → навигация по ролям; Ctrl+K открывается.
- Тесты: unit-тесты дизайн-компонентов (btn/badge/kpi), роутер-тест (все 23 route рендерятся).
