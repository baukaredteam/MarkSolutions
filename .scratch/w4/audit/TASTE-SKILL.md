# TASTE-SKILL — сводка (ШАГ 0)

**Установка:** `npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"` → `.agents/skills/design-taste-frontend` (v2, MIT). Репо также склонировано в `.skills/taste-skill/` (источник + другие скиллы).

## Что даёт

Anti-slop frontend-фреймворк для AI-агентов: правила против «типовой» AI-вёрстки.

- **3 дайла** (1-10): `DESIGN_VARIANCE` (экспериментальность лейаута), `MOTION_INTENSITY` (глубина анимации), `VISUAL_DENSITY` (плотность). Для дашборда: VARIANCE 3-4, MOTION 2-3, DENSITY 7-8.
- **Дизайн-системы** (Section 2): дашборды/админ → Fluent, Carbon, Atlassian, Polaris; лендинги → sда/radix/shadcn.
- **Motion**: Motion (`motion/react`) для UI-компонентов; GSAP+ScrollTrigger только для scroll-историй (в leaf-компонентах с cleanup). Запрет `window.addEventListener('scroll')`.
- **Accessibility**: `prefers-reduced-motion` обязателен при MOTION>3; dark mode обязателен для consumer-страниц; WCAG AA.
- **Anti-AI-Tells** (Section 9): запрет em-dash `—` (вообще), Inter как default (у нас Inter зафиксирован в UI-SPEC — это override), трёх равных карточек, `#000000`/`#ffffff` чистых, декоративных dots, «Section 01»-eyebrows, фейковых скриншотов из div, фейковых версий, «Quietly in use at».
- **Pre-Flight Check** (Section 14): чек-лист ~60 пунктов перед сдачей.

## Компоненты/токены/паттерны

- **Vocabulary** (Section 10): Hero-парадигмы, bento-grid, sticky-stack, marquee (max 1/страницу), skeleton-shimmer, directional hover buttons, mesh gradient.
- **Block Library** (Section 12): схема `blocks/<category>/<name>.md` с frontmatter (dials, when_to_use) + обязательные секции (sketch, props, code, mobile, motion variants, dark, anti-patterns).
- **Токены**: semantic `--surface/--text/--accent` или Tailwind `dark:`; не задаёт конкретные цвета (бренд решает).

## Интеграция с React+Vite+CSS (наш стек)

- **Стек**: React+Vite+plain CSS (не Tailwind, не Next). Применяем **принципы**, а не готовые компоненты (скилл framework-agnostic).
- **UI-SPEC §2 токены НЕ переписываются** (navy/blue/bg/card/line/text/muted/green/yellow/red/violet/cyan/orange, радиусы 18/11, тени, Inter) — taste-skill ДОПОЛНЯЕТ: анти-slop-правила, отступы/ритм, motion-гигиену, reduced-motion, z-index-шкалу, hover/focus-состояния.
- **Section 13 (важно)**: дашборды/плотный product UI — НЕ целевой кейс скилла. Мы берём из него: типографика (размер/вес, не масштаб), спасинг, цветовая калибровка, micro-interactions (hover physics), anti-tells (нет `—`, нет декоративных dots на статусах, нет «секция 01»). Для таблиц/форм используем наш EntityList (ADR-008), а не TanStack (вне MVP).

## Диал-настройка для MarkFlow UI-SPEC

- `DESIGN_VARIANCE: 3` (симметричные карточки, единые отступы — дашборд).
- `MOTION_INTENSITY: 2` (hover/active состояния, без scroll-анимаций; reduced-motion нативно).
- `VISUAL_DENSITY: 8` (cockpit: плотные таблицы, 1px-разделители, маски, mono для чисел где уместно).

## Изменения в процессе UI-тикетов

- Login/hero: герой 2-колонки — применяем hero-принципы (hero ≤ 2 строки H1, subtext ≤ 20 слов, CTA виден без скролла, pt ≤ 24).
- Sidebar/topbar/table: плотность, hairlines вместо «border-t+border-b на каждой строке», hover-строки.
- Toast: фикс право-низ (как в UI-SPEC), варианты success/error/warn.
- Команда: после каждого UI-тикета прогнать subset Pre-Flight (em-dash=0, reduced-motion, hover/focus, mobile collapse ≤900px).
