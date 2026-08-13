import { useEffect, useState } from "react";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { useToast } from "../toast";

interface IntegrationRow {
  id: string;
  name: string;
  icon: string;
  desc: string;
  mode: string;
  latencyP95?: number | null;
  errorsPct?: number;
  errors?: number;
  queue?: number;
  last?: string;
}

// Интеграции (UI-SPEC §4.14): карточки адаптеров со статусом (mock/http из
// конфига) и реальными метриками ИС МПТ/НКТ из outbox.
export function IntegrationsPage() {
  const toast = useToast();
  const [items, setItems] = useState<IntegrationRow[]>([]);

  async function load() {
    try {
      const r = await api.get<{ items: IntegrationRow[] }>(
        "/integrations/status"
      );
      setItems(r.items);
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.", "error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Интеграции</h1>
          <div className="sub">
            API, webhooks, файловый обмен, очереди и мониторинг внешних систем
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-light" onClick={load}>
            ↻ Обновить
          </button>
        </div>
      </div>

      <div className="grid three">
        {items.map((it) => (
          <div className="card" key={it.id}>
            <div style={{ display: "flex" }}>
              <div className="device-icon">{it.icon}</div>
              <span
                className={`badge ${it.mode === "http" ? "b-green" : "b-blue"}`}
                style={{ marginLeft: "auto" }}
                data-status={it.mode === "http" ? "connected" : "mock"}
              >
                {it.mode === "http" ? "Подключено" : "Мок"}
              </span>
            </div>
            <h3>{it.name}</h3>
            <p className="sub">{it.desc}</p>
            <small>
              {it.id === "mpt" &&
                `Latency p95: ${it.latencyP95 ?? "—"} мс · Ошибки ${it.errorsPct ?? 0}% · Очередь: ${it.queue ?? 0}`}
              {it.id === "nkt" &&
                `Очередь: ${it.queue ?? 0} · Ошибки: ${it.errors ?? 0}`}
              {it.id !== "mpt" && it.id !== "nkt" && (it.last ?? "")}
            </small>
          </div>
        ))}
      </div>
      {items.length === 0 && <div className="empty">Нет данных</div>}
    </section>
  );
}
