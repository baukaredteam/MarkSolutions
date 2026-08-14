import { useEffect, useState } from "react";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { sessionStore } from "../session";
import { useToast } from "../toast";
import { EntityList, type Column } from "../entity-list";
import { StatusBadge } from "../badge";
import { formatTenge } from "../money";
import { OrderForm } from "./order-form";

interface OrderRow {
  id: string;
  number?: number;
  gtin: string | null;
  cardName?: string;
  quantity: number;
  totalPrice: string;
  status: string;
  createdAt: string;
}

interface CodeRow {
  id: string;
  gtin: string;
  mask: string;
  status: string;
  orderId: string;
}

interface CodeItem {
  id: string;
  gtin: string;
  mask: string;
  status: string;
}

const REPRINT_REASONS = [
  ["PRINT_DEFECT", "Брак печати"],
  ["DAMAGED_BEFORE_APPLY", "Повреждена до нанесения"],
  ["LOST_LABEL", "Потеряна этикетка"],
  ["OTHER", "Другое"],
] as const;

// Экран «Заказы» (W3+W4-02): заказы, индивидуальные коды с печатью/перепечаткой
// этикеток (bwip-js → PNG preview), скачивание CSV, создание заказа.
export function OrdersPage() {
  const toast = useToast();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [codes, setCodes] = useState<Record<string, CodeItem[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    codeId: string;
    dataUrl: string;
  } | null>(null);
  const [reprintFor, setReprintFor] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("PRINT_DEFECT");
  const [comment, setComment] = useState("");

  async function load() {
    setLoading(true);
    try {
      const o = await api.get<{ items: OrderRow[] }>("/orders");
      setOrders(o.items);
      const c = await api
        .get<{ items: CodeRow[] }>("/api/codes")
        .catch(() => ({ items: [] }));
      const byOrder: Record<string, CodeItem[]> = {};
      for (const row of c.items) {
        const list = await api
          .get<{ items: CodeItem[] }>(`/codes/${row.orderId}/codes`)
          .catch(() => ({ items: [] }));
        byOrder[row.orderId] = list.items;
      }
      setCodes(byOrder);
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

  async function downloadCodes(orderId: string) {
    try {
      const res = await api.postBlob("/codes/export", { orderId });
      if (res.status === 201) {
        const blob = new Blob([res.text], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `markflow-codes-${orderId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.push("Аудит записан (CV-032)");
      }
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`);
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.");
    }
  }

  // UI-05: выгрузка XLSX (для людей, Excel)
  async function downloadXlsx(orderId: string) {
    try {
      const sess = sessionStore.get();
      const res = await fetch(`/api/codes/export/xlsx`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sess?.token}`,
          "Content-Type": "application/json",
          Accept: "*/*",
        },
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(`HTTP ${res.status}: ${err?.message ?? ""}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `markflow-codes-${orderId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.push("Аудит записан (CV-032)");
    } catch (e) {
      toast.push(`Ошибка выгрузки XLSX: ${(e as Error).message}`, "error");
    }
  }

  function fmtOrderNumber(n: number | undefined): string {
    return `KM-2026-${String(n ?? 0).padStart(6, "0")}`;
  }

  async function print(codeId: string) {
    setBusyCode(codeId);
    try {
      const res = await api.post<{ key: string; pngBase64: string }>(
        `/labels/${codeId}/print`,
        {}
      );
      setPreview({ codeId, dataUrl: `data:image/png;base64,${res.pngBase64}` });
      toast.push("Этикетка сформирована (PRINTED)");
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`);
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.");
    } finally {
      setBusyCode(null);
      load();
    }
  }

  async function reprint(codeId: string) {
    setBusyCode(codeId);
    try {
      const res = await api.post<{ key: string; pngBase64: string }>(
        `/labels/${codeId}/reprint`,
        { reasonCode: reason, comment: comment || undefined }
      );
      setPreview({ codeId, dataUrl: `data:image/png;base64,${res.pngBase64}` });
      toast.push("Перепечатано (REPRINTED)");
      setReprintFor(null);
      setComment("");
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`);
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.");
    } finally {
      setBusyCode(null);
      load();
    }
  }

  const canDownload = (status: string) =>
    status === "COMPLETED" || status === "PARTIALLY_COMPLETED";

  // UI-04: прогресс заказа по статусу машины ORD-026 (UI-SPEC §4.6 колонка «Прогресс»)
  const PROGRESS: Record<string, number> = {
    DRAFT: 0,
    VALIDATING: 10,
    FUNDS_RESERVED: 20,
    QUEUED: 30,
    SENT: 40,
    ACCEPTED: 50,
    PROCESSING: 60,
    PARTIALLY_COMPLETED: 80,
    COMPLETED: 100,
    FAILED: 100,
    REJECTED: 100,
    CANCELLED: 100,
  };
  const progressOf = (r: OrderRow) => PROGRESS[r.status] ?? 0;

  const columns: Column<OrderRow>[] = [
    {
      key: "number",
      label: "Заказ",
      render: (r) => <b>{fmtOrderNumber(r.number)}</b>,
    },
    {
      key: "cardName",
      label: "Товар",
      render: (r) => r.cardName || (r.gtin ?? ""),
    },
    { key: "quantity", label: "Кол-во" },
    {
      key: "totalPrice",
      label: "Стоимость",
      render: (r) => formatTenge(BigInt(r.totalPrice)),
    },
    {
      key: "status",
      label: "Статус",
      render: (r) => <StatusBadge code={r.status} />,
    },
    {
      key: "progress",
      label: "Прогресс",
      render: (r) => {
        const p = progressOf(r);
        return (
          <span className="progress">
            <span
              className="progress-bar"
              style={{ width: `${p}%` }}
              data-progress={p}
            />
          </span>
        );
      },
    },
    { key: "createdAt", label: "Создан" },
    {
      key: "actions",
      label: "Действия",
      render: (r) => (
        <>
          <button
            className="btn btn-light btn-sm"
            onClick={() => setSelected(selected === r.id ? null : r.id)}
          >
            {selected === r.id ? "Скрыть" : "Коды"}
          </button>{" "}
          {canDownload(r.status) && (
            <>
              <button
                className="btn btn-light btn-sm"
                onClick={() => downloadCodes(r.id)}
              >
                Скачать CSV
              </button>{" "}
              <button
                className="btn btn-light btn-sm"
                onClick={() => downloadXlsx(r.id)}
              >
                Скачать XLSX
              </button>
            </>
          )}
        </>
      ),
    },
  ];

  const inWork = orders.filter((o) =>
    ["QUEUED", "SENT", "PROCESSING", "PARTIALLY_COMPLETED"].includes(o.status)
  ).length;
  const todayReceived = orders.filter((o) => o.status === "COMPLETED").length;
  const codesThisMonth = orders.reduce((s, o) => s + o.quantity, 0);
  const kpis = [
    { label: "В обработке", value: inWork },
    { label: "Получено сегодня", value: todayReceived },
    {
      label: "Требует внимания",
      value: orders.filter((o) => o.status === "FAILED").length,
    },
    { label: "Кодов за месяц", value: codesThisMonth },
  ];

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Заказы кодов</h1>
          <div className="sub">
            Создание пулов, получение из ИС МПТ, контроль статусов
          </div>
        </div>
      </div>
      <div className="grid four">
        {kpis.map((k) => (
          <div className="card" key={k.label}>
            <b>{k.value}</b>
            <p className="sub">{k.label}</p>
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 15 }}>
        <div className="toolbar">
          <button className="btn btn-light" onClick={load} disabled={loading}>
            ↻ Обновить
          </button>
        </div>
        <EntityList columns={columns} rows={orders} rowKey={(r) => r.id} />
      </div>
      {selected && (
        <section>
          <h2>Коды заказа (печать этикеток DataMatrix)</h2>
          <EntityList
            columns={[
              { key: "gtin", label: "GTIN" },
              { key: "mask", label: "Маска КМ" },
              { key: "status", label: "Статус" },
              {
                key: "actions",
                label: "Этикетка",
                render: (c: CodeItem) => (
                  <>
                    <button
                      onClick={() => print(c.id)}
                      disabled={busyCode === c.id || c.status !== "ACTIVE"}
                    >
                      Печать
                    </button>{" "}
                    <button
                      onClick={() => {
                        setReprintFor(reprintFor === c.id ? null : c.id);
                        setReason("PRINT_DEFECT");
                        setComment("");
                      }}
                      disabled={
                        busyCode === c.id ||
                        (c.status !== "ACTIVE" && c.status !== "PRINTED")
                      }
                    >
                      Перепечатать
                    </button>
                    {preview?.codeId === c.id && (
                      <img
                        src={preview.dataUrl}
                        alt="DataMatrix"
                        style={{
                          maxWidth: 120,
                          verticalAlign: "middle",
                          marginLeft: 8,
                        }}
                      />
                    )}
                  </>
                ),
              },
            ]}
            rows={codes[selected] ?? []}
            rowKey={(c) => c.id}
          />
          {reprintFor && (
            <section style={{ marginTop: 8 }}>
              <label>
                Причина перепечатки:
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  {REPRINT_REASONS.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>{" "}
              {reason === "OTHER" && (
                <input
                  placeholder="Комментарий (мин. 5 символов)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              )}{" "}
              <button
                onClick={() => reprint(reprintFor)}
                disabled={busyCode === reprintFor}
              >
                Подтвердить перепечатку
              </button>
            </section>
          )}
        </section>
      )}
      <OrderForm onCreated={load} />
    </section>
  );
}
