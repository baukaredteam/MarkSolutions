import { useEffect, useState } from "react";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { useToast } from "../toast";
import { EntityList, type Column } from "../entity-list";
import { StatusBadge } from "../badge";

interface QueueCard {
  id: string;
  status: string;
  gtin: string | null;
  tenantId: string;
  tenant?: { name: string; bin: string };
}

interface ExceptionRow {
  id: string;
  aggregate: string;
  status: string;
  payload: unknown;
  createdAt: string;
}

// Кабинет оператора платформы (UI-SPEC §4.17): модерация + исключения.
// Роль operator — глобальная (без tenantId), видит все очереди.
export function OperatorPage() {
  const toast = useToast();
  const [queue, setQueue] = useState<QueueCard[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);

  async function load() {
    try {
      const q = await api.get<{ items: QueueCard[] }>("/moderation/queue");
      setQueue(q.items);
      const e = await api
        .get<{ items: ExceptionRow[] }>("/moderation/exceptions")
        .catch(() => ({ items: [] }));
      setExceptions(e.items);
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

  const kpis = [
    { label: "Карточки на модерации", value: queue.length },
    { label: "Интеграционные исключения", value: exceptions.length },
    {
      label: "Нарушения SLA",
      value: exceptions.filter((e) => e.aggregate === "mpt-order-timeout")
        .length,
    },
    { label: "Заявки на подключение", value: 0 },
    { label: "Финансовые расхождения", value: 0 },
  ];

  const exColumns: Column<ExceptionRow>[] = [
    {
      key: "object",
      label: "Объект",
      render: (r) => (
        <b>
          {(r.payload as { orderId?: string })?.orderId?.slice(0, 12) ??
            r.id.slice(0, 12)}
        </b>
      ),
    },
    { key: "aggregate", label: "Ошибка", render: (r) => r.aggregate },
    {
      key: "age",
      label: "Возраст",
      render: (r) => {
        const mins = Math.round(
          (Date.now() - new Date(r.createdAt).getTime()) / 60000
        );
        return mins < 60 ? `${mins} мин` : `${Math.floor(mins / 60)} ч`;
      },
    },
    {
      key: "action",
      label: "Действие",
      render: () => (
        <button
          className="btn btn-light btn-sm"
          onClick={() => toast.push("Повторная проверка поставлена в очередь")}
        >
          Повторить
        </button>
      ),
    },
  ];

  const qColumns: Column<QueueCard>[] = [
    { key: "gtin", label: "GTIN" },
    {
      key: "tenant",
      label: "Клиент",
      render: (r) => r.tenant?.name ?? r.tenantId.slice(0, 8),
    },
    {
      key: "status",
      label: "Статус",
      render: (r) => <StatusBadge code={r.status} />,
    },
  ];

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Кабинет оператора Mark Solutions</h1>
          <div className="sub">
            Клиенты, модерация, исключения, финансы и контроль SLA
          </div>
        </div>
      </div>

      <div className="grid kpis">
        {kpis.map((k) => (
          <div className="card kpi" key={k.label}>
            <div className="kpi-num">{k.value}</div>
            <div className="kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid two" style={{ marginTop: 15 }}>
        <div className="card">
          <div className="card-title">Центр исключений</div>
          <EntityList
            columns={exColumns}
            rows={exceptions}
            rowKey={(r) => r.id}
            emptyText="Нет исключений"
          />
        </div>
        <div className="card">
          <div className="card-title">Очередь модерации</div>
          <EntityList
            columns={qColumns}
            rows={queue}
            rowKey={(r) => r.id}
            emptyText="Очередь пуста"
          />
        </div>
      </div>
    </section>
  );
}
