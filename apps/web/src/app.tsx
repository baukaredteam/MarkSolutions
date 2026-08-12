import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { Layout } from "./layout";
import { LoginPage } from "./pages/login";
import { DashboardPage } from "./pages/dashboard";
import { CodeCheckPage } from "./pages/code-check";
import { ProductsPage } from "./pages/products";
import { OrdersPage } from "./pages/orders";
import { BalancePage } from "./pages/balance";
import { PAGES, defaultRoute, type Role } from "./roles";
import { sessionStore } from "./session";

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

// /login вне Layout: есть сессия → редирект на default-route; иначе standalone LoginPage.
function LoginGate() {
  const sess = sessionStore.get();
  if (sess) {
    return (
      <Navigate
        to={defaultRoute((sess.roles ?? ["viewer"]) as Role[])}
        replace
      />
    );
  }
  return <LoginPage />;
}

// Layout только при сессии; иначе → /login.
function RequireAuth() {
  const sess = sessionStore.get();
  if (!sess) return <Navigate to="/login" replace />;
  return <Layout />;
}

const STUB_IDS = [
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
  const loc = useLocation();
  // ре-рендер при навигации (sessionStore изменился после login/logout)
  void loc;
  return (
    <Routes>
      <Route path="/login" element={<LoginGate />} />
      <Route element={<RequireAuth />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/codecheck" element={<CodeCheckPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/billing" element={<BalancePage />} />
        {STUB_IDS.map((id) => (
          <Route key={id} path={`/${id}`} element={<StubPage id={id} />} />
        ))}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
