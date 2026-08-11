import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./layout";
import { ApplyPage } from "./pages/apply";
import { StatusPage } from "./pages/status";
import { LoginPage } from "./pages/login";
import { ProductsPage } from "./pages/products";
import { BalancePage } from "./pages/balance";
import { OrdersPage } from "./pages/orders";
import { DashboardPage } from "./pages/dashboard";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/apply" element={<ApplyPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/balance" element={<BalancePage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="*" element={<ApplyPage />} />
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
