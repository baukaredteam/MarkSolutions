import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { sessionStore } from "../session";
import { useToast } from "../toast";
import { defaultRoute, type Role } from "../roles";

export function LoginPage() {
  const toast = useToast();
  const nav = useNavigate();
  const [login, setLogin] = useState("admin@demo");
  const [password, setPassword] = useState("demo-password");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const res = await api.post<{
        tenantId: string;
        token: string;
        roles?: string[];
      }>("/auth/login", { login, password });
      const roles: Role[] = (res.roles ?? ["viewer"]) as Role[];
      sessionStore.set({
        tenantId: res.tenantId,
        token: res.token,
        roles,
        login,
      });
      nav(defaultRoute(roles));
    } catch (e) {
      if (e instanceof ApiErrorResponse) {
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
      } else if (e instanceof ApiUnavailable) {
        toast.push("Сервис недоступен. Попробуйте позже.", "error");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <div className="login-hero">
        <div className="brand">
          <div className="brandmark">MF</div>
          MarkFlow
        </div>
        <div>
          <h1>Маркировка и прослеживаемость без лишней сложности</h1>
          <p>
            Единая платформа для товарных карточек, кодов маркировки, печати,
            склада, документов, биллинга и интеграций.
          </p>
          <div className="hero-points">
            <div className="hero-point">
              <b>Сквозные процессы</b>
              <br />
              <small>От карточки товара до выбытия</small>
            </div>
            <div className="hero-point">
              <b>Защищённый Code Vault</b>
              <br />
              <small>Контроль доступа и аудит выгрузок</small>
            </div>
            <div className="hero-point">
              <b>Интеграции API-first</b>
              <br />
              <small>ИС МПТ, GS1, 1С, WMS и оборудование</small>
            </div>
            <div className="hero-point">
              <b>Ролевые кабинеты</b>
              <br />
              <small>Клиент, склад, оператор и администратор</small>
            </div>
          </div>
        </div>
        <small>
          ТОО «Mark Solutions» · Интерактивный продуктовый прототип v4.0
        </small>
      </div>
      <div className="login-pane">
        <div className="login-card">
          <div
            className="brand"
            style={{ color: "var(--navy)", marginBottom: 34 }}
          >
            <div
              className="brandmark"
              style={{ background: "var(--navy)", color: "#fff" }}
            >
              MF
            </div>
            MarkFlow
          </div>
          <h2>Вход в систему</h2>
          <p className="sub">Используйте тестовые данные или войдите сразу.</p>
          <div className="field">
            <label>Логин</label>
            <input
              className="input"
              placeholder="Логин"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Пароль</label>
            <input
              className="input"
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              margin: "12px 0 18px",
            }}
          >
            <label>
              <input type="checkbox" defaultChecked /> Запомнить меня
            </label>
            <a
              onClick={() =>
                toast.push("Восстановление пароля будет доступно позже", "warn")
              }
            >
              Забыли пароль?
            </a>
          </div>
          <button
            className="btn btn-primary w100"
            onClick={submit}
            disabled={loading}
          >
            Войти
          </button>
          <button
            className="btn btn-light w100"
            style={{ marginTop: 9 }}
            onClick={() =>
              toast.push("ЭЦП подключается в фазе 3 (DOC-051)", "warn")
            }
          >
            Войти с ЭЦП
          </button>
          <p className="hint" style={{ textAlign: "center", marginTop: 20 }}>
            Демо: admin@demo / demo-password (полный набор ролей)
          </p>
        </div>
      </div>
    </div>
  );
}
