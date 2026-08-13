import { useEffect, useState } from "react";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { useToast } from "../toast";
import { EntityList, type Column } from "../entity-list";

interface JournalRow {
  id: string;
  at: string;
  actor: string;
  action: string;
  object: string;
  detail: string;
  source: string;
}

const SOURCE_LABEL: Record<string, string> = {
  "code-event": "Код",
  "vault-export": "Выгрузка",
  outbox: "Очередь",
};

// Журнал аудита (UI-SPEC §4.18): append-only лог (CodeEvent + VaultExport + Outbox).
export function AuditPage() {
  const toast = useToast();
  const [rows, setRows] = useState<JournalRow[]>([]);

  async function load() {
    try {
      const r = await api.get<{ items: JournalRow[] }>("/audit/journal");
      setRows(r.items);
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

  const columns: Column<JournalRow>[] = [
    {
      key: "at",
      label: "Время",
      render: (r) =>
        new Date(r.at).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
    },
    { key: "actor", label: "Субъект" },
    { key: "action", label: "Действие" },
    { key: "object", label: "Объект" },
    { key: "detail", label: "Детали" },
    {
      key: "source",
      label: "Источник",
      render: (r) => SOURCE_LABEL[r.source] ?? r.source,
    },
  ];

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Журнал аудита</h1>
          <div className="sub">
            Append-only лог действий: события кодов, выгрузки, очередь
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-light" onClick={load}>
            ↻ Обновить
          </button>
        </div>
      </div>
      <div className="card">
        <EntityList
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          emptyText="Нет записей"
        />
      </div>
    </section>
  );
}
