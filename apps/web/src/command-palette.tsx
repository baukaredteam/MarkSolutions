import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PAGES, type Role } from "./roles";

const COMMANDS = [
  ["Главная", "/dashboard", "Открыть операционную панель"],
  ["Каталог товаров", "/products", "Найти или создать товар"],
  ["Заказать коды", "/orders", "Создать заказ кодов"],
  ["Code Vault", "/vault", "Работа с защищёнными пулами"],
  ["Проверить код", "/codecheck", "Сканирование и история"],
  ["Производство", "/production", "Линии и задания"],
  ["Склад и ТСД", "/warehouse", "Агрегация и сканирование"],
  ["Документы", "/documents", "ЭЦП и обмен"],
  ["Центр задач", "/tasks", "Мои и командные задачи"],
  ["Центр исключений", "/exceptions", "Ошибки и инциденты"],
  ["Состояние платформы", "/health", "Мониторинг сервисов"],
  ["Конструктор процессов", "/processes", "Маршруты и автоматизация"],
  ["Контрагенты", "/partners", "Участники оборота"],
  ["Отчёты", "/reports", "Аналитика и выгрузки"],
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

  // фильтр по правам роли + fuzzy
  const allowed = useMemo(
    () =>
      COMMANDS.filter(([, path]) => {
        const id = path.slice(1);
        const meta = PAGES.find((p) => p.id === id);
        if (!meta) return true;
        return (
          roles.includes("admin") || meta.roles.some((r) => roles.includes(r))
        );
      }),
    [roles]
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
