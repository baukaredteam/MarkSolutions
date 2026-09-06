import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MODULE_NAV_IDS, PAGES, type ModuleNavId, type Role } from "./roles";

const MODULE_HINTS: Record<ModuleNavId, string> = {
  dashboard: "Операционная панель и KPI",
  tasks: "Задачи, уведомления и SLA",
  search: "Поиск товаров, кодов и документов",
  products: "Каталог и карточки товаров",
  orders: "Заказы кодов маркировки",
  labels: "Печать и шаблоны этикеток",
  aggregation: "Иерархия упаковок",
  documents: "Операции и документы движения",
  shipments: "Поставки и отгрузки",
  production: "Линии и производственные задания",
  warehouse: "Складские операции и ТСД",
  billing: "Лицевой счёт и тарификация",
  reports: "Отчёты и аналитика",
  ai: "ИИ помощник",
  knowledge: "База знаний и инструкции",
  settings: "Организация, доступ и интеграции",
};

const SECONDARY_COMMANDS = [
  ["Code Vault", "/vault", "Защищённые пулы кодов"],
  ["Информация о коде", "/codecheck", "Проверка и история кода"],
  ["Интеграции", "/integrations", "Внешние подключения"],
] as const;

interface Props {
  open: boolean;
  roles: Role[];
  onClose: () => void;
}

export function CommandPalette({ open, roles, onClose }: Props) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const commands = useMemo(
    () => [
      ...MODULE_NAV_IDS.map((id) => [
        PAGES.find((p) => p.id === id)!.title,
        `/${id}`,
        MODULE_HINTS[id],
      ]),
      ...SECONDARY_COMMANDS,
    ],
    []
  );

  // фильтр по правам роли + fuzzy
  const allowed = useMemo(
    () =>
      commands.filter(([, path]) => {
        const id = path.slice(1);
        const meta = PAGES.find((p) => p.id === id);
        if (!meta) return true;
        return (
          roles.includes("admin") || meta.roles.some((r) => roles.includes(r))
        );
      }),
    [roles, commands]
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return allowed;
    return allowed.filter(([label, , hint]) =>
      `${label} ${hint}`.toLowerCase().includes(query)
    );
  }, [q, allowed]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      }
      if (e.key === "Enter" && filtered[active]) {
        nav(filtered[active][1]);
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, active, nav, onClose]);

  if (!open) return null;

  return (
    <div
      className="command-palette show"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="command-box">
        <input
          autoFocus
          className="input command-input"
          placeholder="Перейти к разделу или выполнить действие…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="command-list">
          {filtered.length === 0 && (
            <div className="empty">Ничего не найдено</div>
          )}
          {filtered.map(([label, path, hint], i) => (
            <button
              key={path}
              className={`command-item ${i === active ? "active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                nav(path);
                onClose();
              }}
            >
              <div className="qicon" style={{ width: 22, textAlign: "center" }}>
                {i + 1}
              </div>
              <div>
                <b>{label}</b>
                <small className="sub" style={{ display: "block" }}>
                  {hint}
                </small>
              </div>
              <span className="command-key">Enter</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
