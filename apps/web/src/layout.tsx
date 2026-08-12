import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ToastProvider } from "./toast";
import { sessionStore } from "./session";
import { CommandPalette } from "./command-palette";
import { TourTip } from "./tour";
import { PAGES, NAV_GROUPS, SIDE_BOTTOM, type Role } from "./roles";
import { api } from "./api";

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор клиента",
  manager: "Руководитель",
  accountant: "Бухгалтер",
  marking: "Оператор маркировки",
  warehouse: "Складской оператор",
  viewer: "Наблюдатель",
  operator: "Оператор платформы",
};

const ROLE_ROUTES: Record<string, string> = {
  admin: "/dashboard",
  manager: "/dashboard",
  accountant: "/billing",
  marking: "/labels",
  warehouse: "/warehouse",
  viewer: "/dashboard",
  operator: "/operator",
};

// оператор-кабинет доступен только при переключении роли явно;
// admin по умолчанию → dashboard
function routeFor(roles: string[], picked: string): string {
  if (roles.includes("admin") && picked === "admin") return "/dashboard";
  return ROLE_ROUTES[picked] ?? "/dashboard";
}

// счётчики из GET /dashboard/summary для badge (UI-SPEC §3.1)
async function loadSummary() {
  try {
    const s = await api.get<{
      codesNotApplied: number;
      deadlineSoon: number;
      openAggregates: number;
      docsPendingDt: number;
      exceptions: number;
    }>("/dashboard/summary");
    return s;
  } catch {
    return null;
  }
}

export function Layout() {
  const loc = useLocation();
  const nav = useNavigate();
  const [sess, setSess] = useState(sessionStore.get());
  // перечитать сессию при смене маршрута (login → dashboard и т.д.)
  useEffect(() => {
    setSess(sessionStore.get());
  }, [loc.pathname]);
  const [role, setRole] = useState<string>(
    () => sessionStore.get()?.roles?.[0] ?? "admin"
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const roles: Role[] = (sess?.roles ?? ["admin"]) as Role[];
  const current = loc.pathname.slice(1) || "dashboard";
  const page = PAGES.find((p) => p.id === current);

  // Ctrl+K глобально
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // счётчики на каждый тик авторизации
  useEffect(() => {
    if (!sess) return;
    let alive = true;
    loadSummary().then((s) => {
      if (alive && s) {
        setCounts({
          products: Math.max(s.codesNotApplied, 0),
          orders: Math.max(s.deadlineSoon, 0),
          documents: Math.max(s.docsPendingDt, 0),
          exceptions: Math.max(s.exceptions, 0),
        });
      }
    });
    return () => {
      alive = false;
    };
  }, [sess]);

  if (!sess) {
    // RequireAuth гарантирует сессию; fallback — пустой outlet (страница не рендерится)
    return (
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    );
  }

  function switchRole(next: string) {
    setRole(next);
    nav(routeFor(roles, next));
  }

  function logout() {
    sessionStore.clear();
    setSess(null);
    nav("/login");
  }

  const navId = (id: string) => {
    const meta = PAGES.find((p) => p.id === id);
    if (!meta) return true;
    if (roles.includes("admin")) return true;
    return meta.roles.some((r) => roles.includes(r));
  };

  const countFor = (id: string) => {
    if (!counts) return null;
    if (id === "products") return counts.products;
    if (id === "orders") return counts.orders;
    if (id === "documents") return counts.documents;
    if (id === "exceptions") return counts.exceptions;
    return null;
  };

  return (
    <ToastProvider>
      <div className="shell">
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="side-brand">
            <div className="brandmark">MF</div>
            <div>
              <b style={{ fontSize: 19 }}>MarkFlow</b>
              <small style={{ display: "block", color: "var(--muted)" }}>
                Enterprise
              </small>
            </div>
          </div>
          <div className="tenant">
            <div className="tenant-logo">MS</div>
            <div>
              <b>Mark Solutions Demo</b>
              <small style={{ display: "block", color: "var(--muted)" }}>
                БИН 111111111111
              </small>
            </div>
          </div>
          {NAV_GROUPS.map((g) => (
            <div key={g.label}>
              <div className="nav-label">{g.label}</div>
              {g.ids.filter(navId).map((id) => {
                const meta = PAGES.find((p) => p.id === id)!;
                const c = countFor(id);
                return (
                  <NavLink
                    key={id}
                    to={`/${id}`}
                    className={({ isActive }) =>
                      `nav-item ${isActive ? "active" : ""}`
                    }
                    onClick={() => setSidebarOpen(false)}
                  >
                    <span className="nav-icon">
                      {[
                        "dashboard",
                        "codecheck",
                        "products",
                        "orders",
                        "vault",
                        "labels",
                        "operations",
                        "warehouse",
                        "documents",
                        "reports",
                        "billing",
                        "integrations",
                        "support",
                        "tasks",
                        "production",
                        "partners",
                        "processes",
                        "exceptions",
                        "health",
                      ].includes(id)
                        ? (NAV_ICONS[id] ?? "•")
                        : "•"}
                    </span>
                    {meta.title}
                    {c !== null && c > 0 && (
                      <span className="nav-count">{c}</span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
          <div className="side-bottom">
            {SIDE_BOTTOM.filter(navId).map((id) => {
              const meta = PAGES.find((p) => p.id === id)!;
              return (
                <NavLink
                  key={id}
                  to={`/${id}`}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? "active" : ""}`
                  }
                >
                  <span className="nav-icon">•</span>
                  {meta.title}
                </NavLink>
              );
            })}
            <button className="nav-item" onClick={logout}>
              <span className="nav-icon">⏻</span>Выйти
            </button>
          </div>
        </aside>
        <main className="main">
          <header className="topbar">
            <button
              className="icon-btn mobile-menu"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              ☰
            </button>
            <div className="crumb">MarkFlow / {page?.title ?? current}</div>
            <div className="global-search">
              <input
                className="input"
                placeholder="Поиск товара, GTIN, кода, документа или операции…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    nav("/codecheck");
                  }
                }}
              />
            </div>
            <div className="top-actions">
              <select
                className="role-switch"
                value={role}
                onChange={(e) => switchRole(e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r] ?? r}
                  </option>
                ))}
              </select>
              <button
                className="icon-btn"
                title="Командная палитра Ctrl+K"
                onClick={() => setPaletteOpen(true)}
              >
                ⌘
              </button>
              <button className="icon-btn" onClick={() => nav("/exceptions")}>
                ⚠
              </button>
              <button className="icon-btn" onClick={() => nav("/tasks")}>
                🔔
              </button>
              <div className="profile">
                <div className="avatar">
                  {(sess.login ?? "U").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <b style={{ fontSize: 12 }}>{sess.login}</b>
                  <small style={{ display: "block", color: "var(--muted)" }}>
                    {ROLE_LABELS[role] ?? role}
                  </small>
                </div>
              </div>
            </div>
          </header>
          <div className="content">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette
        open={paletteOpen}
        roles={roles}
        onClose={() => setPaletteOpen(false)}
      />
      <TourTip />
    </ToastProvider>
  );
}

const NAV_ICONS: Record<string, string> = {
  dashboard: "⌂",
  codecheck: "⌗",
  products: "▦",
  orders: "◫",
  vault: "▣",
  labels: "▤",
  operations: "⇄",
  warehouse: "▥",
  documents: "▧",
  reports: "◩",
  billing: "₸",
  integrations: "⌁",
  support: "?",
  tasks: "✓",
  production: "⚙",
  partners: "♢",
  processes: "⤧",
  exceptions: "⚠",
  health: "♥",
};
