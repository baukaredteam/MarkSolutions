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
import { ProductDetailPage } from "./pages/product-detail";
import { OrdersPage } from "./pages/orders";
import { VaultPage } from "./pages/vault";
import { LabelsPage } from "./pages/labels";
import { DocumentsPage } from "./pages/docs";
import { BalancePage } from "./pages/balance";
import { OperatorPage } from "./pages/operator";
import { AuditPage } from "./pages/audit";
import { IntegrationsPage } from "./pages/integrations";
import { TasksPage } from "./pages/tasks";
import { PAGES, defaultRoute, type Role } from "./roles";
import { sessionStore } from "./session";

function StubPage({ id }: { id: string }) {
  const meta = PAGES.find((p) => p.id === id);
  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{meta?.title ?? id}</h1>
          <div className="sub">MARK FLOW · UI shell (16 модулей)</div>
        </div>
      </div>
      <div className="stub">
        <h2>Модуль «{meta?.title ?? id}» — заглушка</h2>
        <p>
          Экран собран в навигационном shell по ТЗ. Бизнес-логика и данные
          подключатся отдельным тикетом; здесь нет имитации backend или ИС МПТ.
          <span className="badge b-violet">Stub</span>
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

// 16 модулей без реализации (stub).
const MODULE_STUB_IDS = [
  "search",
  "aggregation",
  "shipments",
  "production",
  "warehouse",
  "reports",
  "ai",
  "knowledge",
  "settings",
];

// Legacy UI-SPEC v4 stubs (маршруты сохранены, не в каноническом меню).
const LEGACY_STUB_IDS = [
  "support",
  "organization",
  "partners",
  "processes",
  "exceptions",
  "health",
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
        <Route path="/productDetail/:id" element={<ProductDetailPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/vault" element={<VaultPage />} />
        <Route path="/labels" element={<LabelsPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/billing" element={<BalancePage />} />
        <Route path="/operator" element={<OperatorPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route
          path="/operations"
          element={<Navigate to="/documents" replace />}
        />
        {MODULE_STUB_IDS.map((id) => (
          <Route key={id} path={`/${id}`} element={<StubPage id={id} />} />
        ))}
        {LEGACY_STUB_IDS.map((id) => (
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
