import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { EntityList, type Column } from "../entity-list";
import { StatusBadge } from "../badge";
import { useToast } from "../toast";

export interface TaskRow {
  id: string;
  tenantId: string;
  source: string;
  sourceRef: string;
  type: string;
  title: string;
  status: string;
  severity: string;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  ERROR: "Ошибка",
  WARNING: "Предупреждение",
};

const SOURCE_LABEL: Record<string, string> = {
  OUTBOX_FAILED: "Outbox",
  UTILISATION_ALERT: "Нанесение",
};

const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: "Крит.",
  HIGH: "Выс.",
  MEDIUM: "Сред.",
};

const columns: Column<TaskRow>[] = [
  {
    key: "severity",
    label: "Приоритет",
    render: (row) => SEVERITY_LABEL[row.severity] ?? row.severity,
  },
  {
    key: "type",
    label: "Тип",
    render: (row) => TYPE_LABEL[row.type] ?? row.type,
  },
  { key: "title", label: "Задача / событие" },
  {
    key: "source",
    label: "Источник",
    render: (row) => SOURCE_LABEL[row.source] ?? row.source,
  },
  {
    key: "status",
    label: "Статус",
    render: (row) => <StatusBadge code={row.status} />,
  },
];

// TASK minimal: очередь из GET /tasks (проекция Outbox FAILED + UtilisationAlert).
export function TasksPage() {
  const toast = useToast();
  const nav = useNavigate();
  const [items, setItems] = useState<TaskRow[] | null>(null);

  async function load() {
    try {
      const res = await api.get<{ items: TaskRow[] }>("/tasks");
      setItems(res.items);
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.", "error");
      setItems([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const rows = items ?? [];
  const openCount = rows.filter((t) => t.status === "OPEN").length;
  const isEmpty = items !== null && openCount === 0;

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Центр задач и уведомлений</h1>
          <div className="sub">
            Единая рабочая очередь: задачи, ошибки, предупреждения.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-light" onClick={load}>
            ↻ Обновить
          </button>
        </div>
      </div>

      {items === null ? (
        <p className="sub">Загрузка…</p>
      ) : isEmpty ? (
        <div className="card home-empty-state">
          <h2>Открытых задач нет</h2>
          <p className="sub">
            Все текущие задачи обработаны. Новые ошибки, предупреждения и задачи
            появятся здесь автоматически.
          </p>
          <div className="home-empty-actions">
            <button
              className="btn btn-primary"
              onClick={() => nav("/dashboard")}
            >
              Перейти на Главную
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-title">Открытые задачи</div>
          <div className="sub" style={{ marginBottom: 12 }}>
            {openCount} требуют реакции
          </div>
          <EntityList
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            emptyText="Открытых задач нет"
          />
        </div>
      )}
    </section>
  );
}
