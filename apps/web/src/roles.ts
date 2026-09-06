// T0-RBAC: матрица ролей × страниц (CONTEXT.md).
// operator — глобальная модерация (платформа), клиентские роли из JWT roles[].
export type Role =
  | "admin"
  | "manager"
  | "accountant"
  | "marking"
  | "warehouse"
  | "viewer"
  | "operator";

export interface PageMeta {
  id: string;
  title: string;
  roles: Role[];
}

const CLIENT: Role[] = [
  "admin",
  "manager",
  "accountant",
  "marking",
  "warehouse",
  "viewer",
];

// 16 канонических модулей MARK FLOW (Developer Quick Start + layout openM(0)…openM(15)).
export const MODULE_NAV_IDS = [
  "dashboard",
  "tasks",
  "search",
  "products",
  "orders",
  "labels",
  "aggregation",
  "documents",
  "shipments",
  "production",
  "warehouse",
  "billing",
  "reports",
  "ai",
  "knowledge",
  "settings",
] as const;

export type ModuleNavId = (typeof MODULE_NAV_IDS)[number];

export const MODULE_ICONS: Record<ModuleNavId, string> = {
  dashboard: "⌂",
  tasks: "✓",
  search: "⌕",
  products: "▦",
  orders: "▤",
  labels: "▧",
  aggregation: "▥",
  documents: "▣",
  shipments: "⇄",
  production: "⚙",
  warehouse: "▱",
  billing: "₸",
  reports: "▥",
  ai: "✦",
  knowledge: "?",
  settings: "⚙",
};

// Все страницы приложения: 16 модулей + вторичные маршруты (vault, codecheck, …).
export const PAGES: PageMeta[] = [
  {
    id: "dashboard",
    title: "Главная",
    roles: CLIENT,
  },
  {
    id: "tasks",
    title: "Центр задач и уведомлений",
    roles: CLIENT,
  },
  {
    id: "search",
    title: "Глобальный поиск",
    roles: CLIENT,
  },
  {
    id: "products",
    title: "Каталог товаров",
    roles: CLIENT,
  },
  {
    id: "orders",
    title: "Заказ кодов",
    roles: CLIENT,
  },
  {
    id: "labels",
    title: "Печать и этикетки",
    roles: ["admin", "manager", "marking"],
  },
  {
    id: "aggregation",
    title: "Агрегация",
    roles: ["admin", "manager", "marking", "warehouse"],
  },
  {
    id: "documents",
    title: "Операции и документы",
    roles: CLIENT,
  },
  {
    id: "shipments",
    title: "Поставки",
    roles: ["admin", "manager", "marking", "warehouse"],
  },
  {
    id: "production",
    title: "Производство",
    roles: ["admin", "manager", "marking", "warehouse"],
  },
  {
    id: "warehouse",
    title: "Склад и ТСД",
    roles: ["admin", "manager", "marking", "warehouse"],
  },
  {
    id: "billing",
    title: "Биллинг",
    roles: ["admin", "manager", "accountant"],
  },
  {
    id: "reports",
    title: "Отчёты и аналитика",
    roles: CLIENT,
  },
  {
    id: "ai",
    title: "ИИ помощник",
    roles: CLIENT,
  },
  {
    id: "knowledge",
    title: "База знаний",
    roles: CLIENT,
  },
  {
    id: "settings",
    title: "Настройки",
    roles: ["admin", "manager"],
  },
  // Вторичные маршруты (не в левом меню 16 модулей).
  {
    id: "codecheck",
    title: "Информация о коде",
    roles: CLIENT,
  },
  {
    id: "vault",
    title: "Code Vault",
    roles: ["admin", "manager", "accountant", "marking"],
  },
  {
    id: "integrations",
    title: "Интеграции",
    roles: ["admin", "manager", "marking"],
  },
  {
    id: "operator",
    title: "Кабинет оператора",
    roles: ["operator"],
  },
  {
    id: "audit",
    title: "Журнал аудита",
    roles: ["admin", "manager", "accountant", "marking"],
  },
  {
    id: "productDetail",
    title: "Карточка товара",
    roles: CLIENT,
  },
  // Legacy UI-SPEC v4 (маршруты сохранены, не в каноническом меню).
  {
    id: "operations",
    title: "Операции",
    roles: ["admin", "manager", "accountant", "marking", "warehouse"],
  },
  {
    id: "support",
    title: "Поддержка",
    roles: CLIENT,
  },
  {
    id: "organization",
    title: "Организация и доступ",
    roles: ["admin", "manager"],
  },
  {
    id: "partners",
    title: "Контрагенты",
    roles: ["admin", "manager", "accountant", "marking"],
  },
  {
    id: "processes",
    title: "Конструктор процессов",
    roles: ["admin", "manager"],
  },
  {
    id: "exceptions",
    title: "Центр исключений",
    roles: CLIENT,
  },
  {
    id: "health",
    title: "Состояние платформы",
    roles: ["admin", "manager", "marking"],
  },
];

// Левое меню: плоский список 16 модулей (MARK_FLOW_16_modules_exact_layout_v2).
export const NAV_GROUPS: { label: string; ids: string[] }[] = [
  { label: "", ids: [...MODULE_NAV_IDS] },
];

export const SIDE_BOTTOM = ["vault", "integrations", "audit", "operator"];

// Default-route по роли. admin всегда → dashboard;
// operator → оператор-кабинет только если нет admin (глобальная роль).
export function defaultRoute(roles: Role[]): string {
  if (roles.includes("admin")) return "/dashboard";
  if (roles.includes("warehouse")) return "/warehouse";
  if (roles.includes("marking")) return "/labels";
  if (roles.includes("accountant")) return "/billing";
  if (roles.includes("viewer")) return "/dashboard";
  if (roles.includes("operator")) return "/operator";
  return "/dashboard";
}

export function canAccess(roles: Role[], pageId: string): boolean {
  const meta = PAGES.find((p) => p.id === pageId);
  if (!meta) return false;
  if (roles.includes("admin")) return true;
  return meta.roles.some((r) => roles.includes(r));
}
