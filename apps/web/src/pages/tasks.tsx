import { useEffect, useState, type MouseEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  relatedHref?: string;
}

const TYPE_LABEL: Record<string, string> = {
  ERROR: "Ошибка",
  WARNING: "Предупреждение",
};

const SOURCE_LABEL: Record<string, string> = {
  OUTBOX_FAILED: "Outbox",
  UTILISATION_ALERT: "Нанесение",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Открыта",
  DONE: "Завершена",
};

const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: "Крит.",
  HIGH: "Выс.",
  MEDIUM: "Сред.",
};

const TASK_SOURCES = ["OUTBOX_FAILED", "UTILISATION_ALERT"] as const;
const TASK_STATUSES = ["OPEN", "DONE"] as const;

export function taskRelatedHref(row: Pick<TaskRow, "source" | "relatedHref">) {
  if (row.relatedHref) return row.relatedHref;
  return row.source === "UTILISATION_ALERT"
    ? "/operations/utilisation"
    : "/orders";
}

export function formatTaskCreatedAt(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy} · ${hh}:${mi}`;
}

export function formatTaskAge(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} мин`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} ч`;
  return `${Math.floor(hours / 24)} дн`;
}

function tasksPath(source: string, status: string): string {
  const q = new URLSearchParams();
  if (source) q.set("source", source);
  if (status) q.set("status", status);
  const qs = q.toString();
  return qs ? `/tasks?${qs}` : "/tasks";
}

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
    render: (row) => (
      <span data-task-href={taskRelatedHref(row)}>
        {SOURCE_LABEL[row.source] ?? row.source}
      </span>
    ),
  },
  {
    key: "createdAt",
    label: "Создано",
    render: (row) => (
      <span>
        {formatTaskCreatedAt(row.createdAt)}
        <span className="sub"> · {formatTaskAge(row.createdAt)}</span>
      </span>
    ),
  },
  {
    key: "status",
    label: "Статус",
    render: (row) => <StatusBadge code={row.status} />,
  },
];

// TASK-02: очередь GET /tasks, фильтры source+status в query, ряд → related route.
export function TasksPage() {
  const toast = useToast();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const sourceFilter = params.get("source") ?? "";
  const statusFilter = params.get("status") ?? "";
  const [items, setItems] = useState<TaskRow[] | null>(null);

  async function load() {
    try {
      const res = await api.get<{ items: TaskRow[] }>(
        tasksPath(sourceFilter, statusFilter)
      );
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
  }, [sourceFilter, statusFilter]);

  function setFilter(key: "source" | "status", value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  function onQueueClick(e: MouseEvent<HTMLDivElement>) {
    const href = (e.target as HTMLElement)
      .closest("tr")
      ?.querySelector("[data-task-href]")
      ?.getAttribute("data-task-href");
    if (href) nav(href);
  }

  const rows = items ?? [];
  const openCount = rows.filter((t) => t.status === "OPEN").length;
  const hasFilter = Boolean(sourceFilter || statusFilter);
  const isEmpty = items !== null && rows.length === 0;

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
      ) : (
        <>
          <div className="card" style={{ marginBottom: 15 }}>
            <div className="toolbar">
              <label className="field" style={{ margin: 0 }}>
                Источник
                <select
                  aria-label="Фильтр: источник"
                  value={
                    TASK_SOURCES.includes(
                      sourceFilter as (typeof TASK_SOURCES)[number]
                    )
                      ? sourceFilter
                      : ""
                  }
                  onChange={(e) => setFilter("source", e.target.value)}
                >
                  <option value="">Все источники</option>
                  {TASK_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {SOURCE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ margin: 0 }}>
                Статус
                <select
                  aria-label="Фильтр: статус"
                  value={
                    TASK_STATUSES.includes(
                      statusFilter as (typeof TASK_STATUSES)[number]
                    )
                      ? statusFilter
                      : ""
                  }
                  onChange={(e) => setFilter("status", e.target.value)}
                >
                  <option value="">Все статусы</option>
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {isEmpty ? (
            <div className="card home-empty-state">
              <h2>
                {hasFilter
                  ? "Нет задач по выбранным фильтрам"
                  : "Открытых задач нет"}
              </h2>
              {!hasFilter && (
                <>
                  <p className="sub">
                    Все текущие задачи обработаны. Новые ошибки, предупреждения
                    и задачи появятся здесь автоматически.
                  </p>
                  <div className="home-empty-actions">
                    <button
                      className="btn btn-primary"
                      onClick={() => nav("/dashboard")}
                    >
                      Перейти на Главную
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="card">
              <div className="card-title">Открытые задачи</div>
              <div className="sub" style={{ marginBottom: 12 }}>
                {openCount} требуют реакции
              </div>
              <div onClick={onQueueClick} style={{ cursor: "pointer" }}>
                <EntityList
                  columns={columns}
                  rows={rows}
                  rowKey={(row) => row.id}
                  emptyText="Открытых задач нет"
                />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
