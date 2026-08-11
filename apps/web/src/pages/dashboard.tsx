import { useEffect, useState } from "react";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { useToast } from "../toast";
import { EntityList, type Column } from "../entity-list";
import { useNavigate } from "react-router-dom";

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

interface Summary {
  codesNotApplied: number;
  deadlineSoon: number;
  openAggregates: number;
  docsPendingDt: number;
  exceptions: number;
}

const WITHDRAWAL_REASONS = [
  ["DEFECT", "Брак"],
  ["LOST", "Утеря"],
  ["EXPIRY", "Истёк срок"],
  ["RETURN_SUPPLIER", "Возврат поставщику"],
  ["DESTRUCTION", "Уничтожение"],
  ["OTHER", "Другое"],
] as const;

// Дашборд W4-06 (Q10): «Следующие действия» (5 счётчиков, zero-hidden) +
// вкладка «Документы» (EntityList) с кнопками ввоза/вывода.
export function DashboardPage() {
  const toast = useToast();
  const nav = useNavigate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<ExceptionRow[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [orders, setOrders] = useState<{ id: string }[]>([]);
  const [tab, setTab] = useState<"summary" | "docs">("summary");
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showWithdrawal, setShowWithdrawal] = useState(false);
  const [importOrder, setImportOrder] = useState("");
  const [dtNumber, setDtNumber] = useState("");
  const [dtDate, setDtDate] = useState("");
  const [wCodes, setWCodes] = useState("");
  const [wType, setWType] = useState("WRITE_OFF");
  const [wReason, setWReason] = useState("DEFECT");
  const [wComment, setWComment] = useState("");

  async function load() {
    setLoading(true);
    try {
      const s = await api.get<Summary>("/dashboard/summary");
      setSummary(s);
      const [r, d, o] = await Promise.all([
        api
          .get<{ items: ExceptionRow[] }>("/moderation/exceptions")
          .catch(() => ({ items: [] })),
        api.get<{ items: DocRow[] }>("/documents").catch(() => ({ items: [] })),
        api
          .get<{ items: { id: string }[] }>("/orders")
          .catch(() => ({ items: [] })),
      ]);
      setRows(r.items);
      setDocs(d.items);
      setOrders(o.items);
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

  async function doImport() {
    if (!importOrder || !dtNumber || !dtDate) {
      toast.push("Заполните заказ, номер и дату ДТ");
      return;
    }
    try {
      const res = await api.post<{ status: string }>("/import", {
        orderId: importOrder,
        customsDeclaration: { date: dtDate, number: dtNumber },
      });
      toast.push(
        res.status === "SUCCESS"
          ? "Ввоз оформлен (INTRODUCED)"
          : `Ввоз: ${res.status}`
      );
      setShowImport(false);
      load();
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`);
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.");
    }
  }

  async function doWithdrawal() {
    const codes = wCodes
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!codes.length) {
      toast.push("Укажите коды (id)");
      return;
    }
    if (wReason === "OTHER" && wComment.trim().length < 5) {
      toast.push("Для OTHER требуется комментарий (мин. 5 символов)");
      return;
    }
    try {
      const res = await api.post<{ status: string }>("/withdrawal", {
        codes,
        withdrawalType: wType,
        withdrawalReason: wReason,
        comment: wReason === "OTHER" ? wComment : undefined,
      });
      toast.push(
        res.status === "SUCCESS" ? "Вывод выполнен" : `Вывод: ${res.status}`
      );
      setShowWithdrawal(false);
      setWCodes("");
      load();
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`);
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.");
    }
  }

  const cards: { key: keyof Summary; label: string; link: string }[] = [
    { key: "codesNotApplied", label: "Коды без нанесения", link: "/orders" },
    { key: "deadlineSoon", label: "Дедлайн ≤ 7 дней", link: "/orders" },
    { key: "openAggregates", label: "Открытые агрегаты", link: "/aggregation" },
    {
      key: "docsPendingDt",
      label: "ДТ ожидает оформления",
      link: "/documents",
    },
    { key: "exceptions", label: "Исключения", link: "/dashboard" },
  ];

  const columns: Column<ExceptionRow>[] = [
    { key: "id", label: "ID" },
    { key: "aggregate", label: "Тип" },
    { key: "reason", label: "Причина", render: (r) => r.payload.reason ?? "-" },
    { key: "orderId", label: "Заказ", render: (r) => r.payload.orderId ?? "-" },
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
      <h1>Дашборд</h1>
      <button onClick={() => setTab("summary")}>Сводка</button>
      <button onClick={() => setTab("docs")}>Документы</button>
      <button onClick={load} disabled={loading}>
        Обновить
      </button>

      {tab === "summary" && (
        <>
          <h2>Следующие действия</h2>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {summary &&
              cards.map((c) => {
                const v = summary[c.key];
                if (v === 0) return null; // zero-hidden
                return (
                  <button
                    key={c.key}
                    onClick={() => nav(c.link)}
                    style={{ minWidth: 140 }}
                  >
                    <div style={{ fontSize: 24 }}>{v}</div>
                    <div>{c.label}</div>
                  </button>
                );
              })}
          </div>
          <h2>Исключения</h2>
          <EntityList columns={columns} rows={rows} rowKey={(r) => r.id} />
        </>
      )}

      {tab === "docs" && (
        <>
          <h2>Документы</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button onClick={() => setShowImport(!showImport)}>
              Оформить ввоз
            </button>
            <button onClick={() => setShowWithdrawal(!showWithdrawal)}>
              Вывод/списание
            </button>
          </div>
          {showImport && (
            <section style={{ marginBottom: 12 }}>
              <label>
                Заказ:
                <select
                  value={importOrder}
                  onChange={(e) => setImportOrder(e.target.value)}
                >
                  <option value="">— выберите —</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.id}
                    </option>
                  ))}
                </select>
              </label>{" "}
              <input
                placeholder="Номер ДТ"
                value={dtNumber}
                onChange={(e) => setDtNumber(e.target.value)}
              />{" "}
              <input
                placeholder="Дата ДТ (YYYY-MM-DD)"
                value={dtDate}
                onChange={(e) => setDtDate(e.target.value)}
              />{" "}
              <button onClick={doImport}>Отправить</button>
            </section>
          )}
          {showWithdrawal && (
            <section style={{ marginBottom: 12 }}>
              <input
                placeholder="Коды (id, через запятую)"
                value={wCodes}
                onChange={(e) => setWCodes(e.target.value)}
              />{" "}
              <select value={wType} onChange={(e) => setWType(e.target.value)}>
                <option value="WRITE_OFF">Списание (WRITE_OFF)</option>
                <option value="WITHDRAWAL">Вывод (WITHDRAWAL)</option>
              </select>{" "}
              <select
                value={wReason}
                onChange={(e) => setWReason(e.target.value)}
              >
                {WITHDRAWAL_REASONS.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>{" "}
              {wReason === "OTHER" && (
                <input
                  placeholder="Комментарий (мин. 5)"
                  value={wComment}
                  onChange={(e) => setWComment(e.target.value)}
                />
              )}{" "}
              <button onClick={doWithdrawal}>Отправить</button>
            </section>
          )}
          <EntityList columns={docColumns} rows={docs} rowKey={(r) => r.id} />
        </>
      )}
    </section>
  );
}
