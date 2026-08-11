import { useEffect, useState } from "react";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { useToast } from "../toast";
import { EntityList, type Column } from "../entity-list";

interface ExceptionRow {
  id: string;
  aggregate: string;
  status: string;
  payload: {
    orderId?: string;
    reason?: string;
    expected?: number;
    actual?: number;
    mptStatus?: string;
  };
  createdAt: string;
}

interface DocRow {
  id: string;
  type: string;
  date: string;
  status: string;
  rejectReason: string | null;
}

// Дашборд «Алерты/Задачи» (W3): GET /moderation/exceptions.
// W4-04: вкладка «Документы» (GET /documents, EntityList ADR-008).
export function DashboardPage() {
  const toast = useToast();
  const [rows, setRows] = useState<ExceptionRow[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [tab, setTab] = useState<"deadline" | "all" | "docs">("deadline");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get<{ items: ExceptionRow[] }>(
        "/moderation/exceptions"
      );
      setRows(r.items);
      const d = await api
        .get<{ items: DocRow[] }>("/documents")
        .catch(() => ({ items: [] }));
      setDocs(d.items);
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`);
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const deadline = rows.filter((r) =>
    String(r.payload.reason ?? "")
      .toLowerCase()
      .includes("deadline")
  );
  const visible = tab === "deadline" ? deadline : rows;

  const columns: Column<ExceptionRow>[] = [
    { key: "id", label: "ID" },
    { key: "aggregate", label: "Тип" },
    {
      key: "reason",
      label: "Причина",
      render: (r) => r.payload.reason ?? "-",
    },
    {
      key: "orderId",
      label: "Заказ",
      render: (r) => r.payload.orderId ?? "-",
    },
    { key: "createdAt", label: "Время" },
  ];

  const docColumns: Column<DocRow>[] = [
    { key: "id", label: "ID" },
    { key: "type", label: "Тип" },
    { key: "status", label: "Статус" },
    {
      key: "rejectReason",
      label: "Причина отказа",
      render: (d) => d.rejectReason ?? "-",
    },
    { key: "date", label: "Дата" },
  ];

  return (
    <section>
      <h1>Алерты и задачи</h1>
      <button onClick={() => setTab("deadline")}>Дедлайны 30 дней</button>
      <button onClick={() => setTab("all")}>Все исключения</button>
      <button onClick={() => setTab("docs")}>Документы</button>
      <button onClick={load} disabled={loading}>
        Обновить
      </button>
      {tab === "docs" ? (
        <EntityList columns={docColumns} rows={docs} rowKey={(r) => r.id} />
      ) : (
        <EntityList columns={columns} rows={visible} rowKey={(r) => r.id} />
      )}
    </section>
  );
}
