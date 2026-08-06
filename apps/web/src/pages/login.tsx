import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { sessionStore } from "../session";
import { useToast } from "../toast";

export function LoginPage() {
  const toast = useToast();
  const nav = useNavigate();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const res = await api.post<{ tenantId: string; token: string }>(
        "/auth/login",
        {
          login,
          password,
        }
      );
      sessionStore.set({ tenantId: res.tenantId, token: res.token });
      nav("/products");
    } catch (e) {
      if (e instanceof ApiErrorResponse) {
        toast.push(`${e.error.code}: ${e.error.message}`);
      } else if (e instanceof ApiUnavailable) {
        toast.push("Сервис недоступен. Попробуйте позже.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h1>Вход</h1>
      <input
        placeholder="Логин"
        value={login}
        onChange={(e) => setLogin(e.target.value)}
      />
      <input
        type="password"
        placeholder="Пароль"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button onClick={submit} disabled={loading}>
        Войти
      </button>
      <button
        onClick={() => toast.push("Восстановление пароля будет доступно позже")}
      >
        Забыли пароль?
      </button>
    </section>
  );
}
