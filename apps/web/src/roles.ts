// T0-RBAC: матрица ролей × страниц (CONTEXT.md, UI-SPEC §7).
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

// Все 23 страницы UI-SPEC §4. Роли: какой роли доступен пункт меню.
export const PAGES: PageMeta[] = [
  {
    id: "dashboard",
    title: "Главная",
    roles: ["admin", "manager", "accountant", "marking", "warehouse", "viewer"],
  },
  {
    id: "codecheck",
    title: "Информация о коде",
    roles: ["admin", "manager", "accountant", "marking", "warehouse", "viewer"],
  },
  {
    id: "products",
    title: "Товары",
    roles: ["admin", "manager", "accountant", "marking", "warehouse", "viewer"],
  },
  {
    id: "orders",
    title: "Заказы кодов",
    roles: ["admin", "manager", "accountant", "marking", "warehouse", "viewer"],
  },
  {
    id: "vault",
    title: "Code Vault",
    roles: ["admin", "manager", "accountant", "marking"],
  },
  {
    id: "labels",
    title: "Этикетки",
    roles: ["admin", "manager", "accountant", "marking", "warehouse"],
  },
  {
    id: "operations",
    title: "Операции",
    roles: ["admin", "manager", "accountant", "marking", "warehouse"],
  },
  {
    id: "warehouse",
    title: "Склад и ТСД",
    roles: ["admin", "manager", "marking", "warehouse"],
  },
  {
    id: "documents",
    title: "Документы",
    roles: ["admin", "manager", "accountant", "marking", "warehouse", "viewer"],
  },
  {
    id: "reports",
    title: "Отчёты",
    roles: ["admin", "manager", "accountant", "marking", "warehouse", "viewer"],
  },
  {
    id: "billing",
    title: "Биллинг",
    roles: ["admin", "manager", "accountant"],
  },
  {
    id: "integrations",
    title: "Интеграции",
    roles: ["admin", "manager", "marking"],
  },
  {
    id: "support",
    title: "Поддержка",
    roles: ["admin", "manager", "accountant", "marking", "warehouse", "viewer"],
  },
  {
    id: "organization",
    title: "Организация и доступ",
    roles: ["admin", "manager"],
  },
  { id: "operator", title: "Кабинет оператора", roles: ["operator"] },
  {
    id: "audit",
    title: "Журнал аудита",
    roles: ["admin", "manager", "accountant", "marking"],
  },
  {
    id: "tasks",
    title: "Центр задач",
    roles: ["admin", "manager", "accountant", "marking", "warehouse", "viewer"],
  },
  {
    id: "production",
    title: "Производство",
    roles: ["admin", "manager", "marking", "warehouse"],
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
    roles: ["admin", "manager", "accountant", "marking", "warehouse", "viewer"],
  },
  {
    id: "health",
    title: "Состояние платформы",
    roles: ["admin", "manager", "marking"],
  },
  {
    id: "productDetail",
    title: "Карточка товара",
    roles: ["admin", "manager", "accountant", "marking", "warehouse", "viewer"],
  },
];

// Группы sidebar (UI-SPEC §3.1) — порядок и label
export const NAV_GROUPS: { label: string; ids: string[] }[] = [
  { label: "Рабочее пространство", ids: ["dashboard", "codecheck"] },
  {
    label: "Основные процессы",
    ids: [
      "products",
      "orders",
      "vault",
      "labels",
      "operations",
      "warehouse",
      "documents",
    ],
  },
  {
    label: "Управление работой",
    ids: ["tasks", "production", "partners", "processes"],
  },
  {
    label: "Контроль и сервис",
    ids: [
      "exceptions",
      "health",
      "reports",
      "billing",
      "integrations",
      "support",
    ],
  },
];

export const SIDE_BOTTOM = ["organization", "operator", "audit"];

// Default-route по роли (UI-SPEC §3.2). admin всегда → dashboard;
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
  // admin/operator имеют полный доступ (все клиентские + платформа)
  if (roles.includes("admin")) return true;
  return meta.roles.some((r) => roles.includes(r));
}
