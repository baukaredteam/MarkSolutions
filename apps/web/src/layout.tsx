import { NavLink, Outlet } from "react-router-dom";
import { ToastProvider } from "./toast";

const links = [
  { to: "/apply", label: "Заявка" },
  { to: "/status", label: "Статус" },
  { to: "/login", label: "Вход" },
  { to: "/products", label: "Товары" },
  { to: "/balance", label: "Баланс" },
  { to: "/orders", label: "Заказы" },
  { to: "/dashboard", label: "Алерты" },
];

export function Layout() {
  return (
    <ToastProvider>
      <header>
        <strong>MarkFlow</strong>
        <nav>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to}>
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </ToastProvider>
  );
}
