import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./layout";
import { LoginPage } from "./pages/login";
import { DashboardPage } from "./pages/dashboard";
import { ProductsPage } from "./pages/products";
import { OrdersPage } from "./pages/orders";
import { BalancePage } from "./pages/balance";
import { PAGES } from "./roles";

function StubPage({ id }: { id: string }) {
  const meta = PAGES.find((p) => p.id === id);
  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{meta?.title ?? id}</h1>
          <div className="sub">
            Экран из UI-SPEC v4 (docs/ui-reference.html).
          </div>
        </div>
      </div>
      <div className="stub">
        <h2>Экран «{meta?.title ?? id}» ещё не пересобран</h2>
        <p>
          Реализуется в рамках тикета фронт-пересборки. На данном этапе это
          заглушка.
          <span className="badge b-violet">Эволюция</span>
        </p>
        <p className="sub">
          Данные будут подключаться из реального API после ревью спеки.
        </p>
      </div>
    </section>
  );
}

const STUB_IDS = [
  "codecheck",
  "vault",
  "labels",
  "operations",
  "warehouse",
  "documents",
  "reports",
  "integrations",
  "support",
  "organization",
  "operator",
  "audit",
  "tasks",
  "production",
  "partners",
  "processes",
  "exceptions",
  "health",
  "productDetail",
];

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/billing" element={<BalancePage />} />
        {STUB_IDS.map((id) => (
          <Route key={id} path={`/${id}`} element={<StubPage id={id} />} />
        ))}
        <Route path="*" element={<LoginPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
