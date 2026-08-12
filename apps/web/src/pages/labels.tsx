import { useEffect, useState } from "react";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { sessionStore } from "../session";
import { useToast } from "../toast";
import { EntityList, type Column } from "../entity-list";

interface OrderOption {
  id: string;
  number?: number;
  gtin: string | null;
  status: string;
}

interface CodeItem {
  id: string;
  gtin: string;
  mask: string;
  status: string;
}

interface PrintTask {
  id: string;
  printer: string;
  labels: number;
  progress: number;
  status: "pending" | "done";
}

const REPRINT_REASONS = [
  ["PRINT_DEFECT", "Брак печати"],
  ["DAMAGED_BEFORE_APPLY", "Повреждена до нанесения"],
  ["LOST_LABEL", "Потеряна этикетка"],
  ["OTHER", "Другое"],
] as const;

const CODE_BADGE: Record<string, string> = {
  ACTIVE: "b-green",
  PRINTED: "b-blue",
  APPLIED: "b-gray",
  INTRODUCED: "b-blue",
  UTILISED: "b-gray",
  WITHDRAWN: "b-red",
  WRITTEN_OFF: "b-red",
};

// Роли, которым доступны печать/перепечатка (роль-гард бэкенда идентичен)
const PRINT_ROLES = ["admin", "manager", "marking"];

function fmtOrderNumber(n: number | undefined): string {
  return `KM-2026-${String(n ?? 0).padStart(6, "0")}`;
}

// Этикетки (UI-SPEC §4.8, тикет 06): печать/перепечатка КМ заказа, PNG-превью,
// клиентская очередь печати (эволюция LBL-038), устройства-заглушки.
export function LabelsPage() {
  const toast = useToast();
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [orderId, setOrderId] = useState<string>("");
  const [codes, setCodes] = useState<CodeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    codeId: string;
    dataUrl: string;
  } | null>(null);
  const [reprintFor, setReprintFor] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("PRINT_DEFECT");
  const [comment, setComment] = useState("");
  const [tasks, setTasks] = useState<PrintTask[]>([]);

  const sess = sessionStore.get();
  const roles = sess?.roles ?? [];
  const canPrint = PRINT_ROLES.some((r) => roles.includes(r));

  async function loadOrders() {
    try {
      const o = await api.get<{ items: OrderOption[] }>("/orders");
      setOrders(o.items);
      if (!orderId && o.items.length > 0) setOrderId(o.items[0].id);
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.", "error");
    }
  }

  async function loadCodes(id: string) {
    if (!id) return setCodes([]);
    setLoading(true);
    try {
      const c = await api.get<{ items: CodeItem[] }>(`/codes/${id}/codes`);
      setCodes(c.items);
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    loadCodes(orderId);
  }, [orderId]);

  function pushTask(printer: string, done: boolean) {
    const id = `PR-${String(Date.now()).slice(-6)}`;
    setTasks((t) => [
      {
        id,
        printer,
        labels: 1,
        progress: done ? 100 : 72,
        status: done ? "done" : "pending",
      },
      ...t,
    ]);
  }

  async function print(codeId: string) {
    if (!canPrint) {
      toast.push("403: операция доступна ролям admin/manager/marking", "error");
      return;
    }
    setBusyCode(codeId);
    try {
      const res = await api.post<{ key: string; pngBase64: string }>(
        `/labels/${codeId}/print`,
        {}
      );
      setPreview({ codeId, dataUrl: `data:image/png;base64,${res.pngBase64}` });
      toast.push("Этикетка сформирована (PRINTED)");
      pushTask("Zebra ZT411 #1", true);
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.", "error");
    } finally {
      setBusyCode(null);
      loadCodes(orderId);
    }
  }

  async function reprint(codeId: string) {
    if (!canPrint) {
      toast.push("403: операция доступна ролям admin/manager/marking", "error");
      return;
    }
    if (reason === "OTHER" && comment.trim().length < 5) {
      toast.push(
        "400: для OTHER требуется комментарий (мин. 5 символов)",
        "error"
      );
      return;
    }
    setBusyCode(codeId);
    try {
      const res = await api.post<{ key: string; pngBase64: string }>(
        `/labels/${codeId}/reprint`,
        { reasonCode: reason, comment: comment || undefined }
      );
      setPreview({ codeId, dataUrl: `data:image/png;base64,${res.pngBase64}` });
      toast.push("Перепечатано (REPRINTED), аудит записан (CV-032)");
      setReprintFor(null);
      setComment("");
      pushTask("Zebra ZT411 #1", true);
    } catch (e) {
      if (e instanceof ApiErrorResponse) {
        const msg =
          e.error.code === 409
            ? "409: требуется перемаркировка (код уже нанесён)"
            : e.error.code === 400
              ? `400: ${e.error.message}`
              : `${e.error.code}: ${e.error.message}`;
        toast.push(msg, "error");
      } else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.", "error");
    } finally {
      setBusyCode(null);
      loadCodes(orderId);
    }
  }

  const canDownloadOrder = (o: OrderOption) =>
    ["COMPLETED", "PARTIALLY_COMPLETED"].includes(o.status);

  const codeColumns: Column<CodeItem>[] = [
    { key: "gtin", label: "GTIN" },
    { key: "mask", label: "Маска КМ" },
    {
      key: "status",
      label: "Статус",
      render: (c) => (
        <span className={`badge ${CODE_BADGE[c.status] ?? "b-gray"}`}>
          {c.status}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Этикетка",
      render: (c) => (
        <>
          {canPrint && (
            <>
              <button
                className="btn btn-light btn-sm"
                onClick={() => print(c.id)}
                disabled={busyCode === c.id || c.status !== "ACTIVE"}
              >
                Печать
              </button>{" "}
              <button
                className="btn btn-light btn-sm"
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
            </>
          )}
        </>
      ),
    },
  ];

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Этикетки</h1>
          <div className="sub">
            Печать и перепечатка этикеток DataMatrix, очередь печати, устройства
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-light"
            onClick={() => {
              loadOrders();
              loadCodes(orderId);
            }}
            disabled={loading}
          >
            ↻ Обновить
          </button>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <label className="sub" style={{ marginRight: 6 }}>
            Заказ:
          </label>
          <select
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            style={{ maxWidth: 280 }}
          >
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {fmtOrderNumber(o.number)} · {o.gtin} · {o.status}
              </option>
            ))}
          </select>
          {orders.find((o) => o.id === orderId)?.status &&
            canDownloadOrder(orders.find((o) => o.id === orderId)!) &&
            canPrint && (
              <span className="sub" style={{ marginLeft: 8 }}>
                Коды получены — можно печатать
              </span>
            )}
        </div>
        <EntityList
          columns={codeColumns}
          rows={codes}
          rowKey={(c) => c.id}
          emptyText="Нет кодов в заказе (дождитесь эмиссии)"
        />
      </div>

      <div className="grid two" style={{ marginTop: 15 }}>
        <div className="card">
          <div className="card-title">Очередь печати</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Задание</th>
                  <th>Принтер</th>
                  <th>Этикетки</th>
                  <th>Прогресс</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty">
                      Заданий нет
                    </td>
                  </tr>
                )}
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <b>{t.id}</b>
                    </td>
                    <td>{t.printer}</td>
                    <td>{t.labels}</td>
                    <td>{t.progress}%</td>
                    <td>
                      <span
                        className={`badge ${t.status === "done" ? "b-green" : "b-blue"}`}
                      >
                        {t.status === "done" ? "Завершено" : "Печать"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Устройства</div>
          <div className="device">
            <div className="device-icon">🖨</div>
            <div>
              <b>Zebra ZT411 #1</b>
              <small className="sub" style={{ display: "block" }}>
                300 DPI · Линия №1
              </small>
            </div>
            <span className="badge b-green" style={{ marginLeft: "auto" }}>
              Готов
            </span>
          </div>
          <div className="device" style={{ marginTop: 9 }}>
            <div className="device-icon">🖨</div>
            <div>
              <b>Zebra ZT411 #2</b>
              <small className="sub" style={{ display: "block" }}>
                300 DPI · Линия №2
              </small>
            </div>
            <span className="badge b-blue" style={{ marginLeft: "auto" }}>
              Печатает
            </span>
          </div>
        </div>
      </div>

      {preview && (
        <div className="card" style={{ marginTop: 15 }}>
          <div className="card-title">Превью этикетки</div>
          <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
            <img
              src={preview.dataUrl}
              alt="DataMatrix"
              style={{
                maxWidth: 220,
                border: "1px solid #edf1f5",
                borderRadius: 10,
                padding: 10,
                background: "#fff",
              }}
            />
            <div className="sub" style={{ lineHeight: 1.7 }}>
              <div>Код: {preview.codeId.slice(0, 12)}…</div>
              <div>Размер: 58×40 мм</div>
              <div>Разрешение: 300 DPI</div>
              <div>Качество: оптимизация 300 DPI</div>
              <button
                className="btn btn-light btn-sm"
                onClick={() => setPreview(null)}
                style={{ marginTop: 8 }}
              >
                Закрыть превью
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`overlay ${reprintFor ? "show" : ""}`}
        onClick={() => setReprintFor(null)}
      />
      <div className={`modal ${reprintFor ? "show" : ""}`}>
        <div className="modal-card">
          <div className="modal-head">
            <h3>Перепечатка этикетки</h3>
            <button
              className="btn btn-light btn-sm"
              onClick={() => setReprintFor(null)}
            >
              ✕
            </button>
          </div>
          <p className="sub">
            Укажите причину перепечатки (обязательно, фиксируется в аудите
            CV-032).
          </p>
          <div className="field">
            <label htmlFor="reprint-reason">Причина</label>
            <select
              id="reprint-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {REPRINT_REASONS.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {reason === "OTHER" && (
            <div className="field">
              <label>Комментарий (мин. 5 символов)</label>
              <input
                className="input"
                placeholder="Опишите причину"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          )}
          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
            }}
          >
            <button
              className="btn btn-light"
              onClick={() => setReprintFor(null)}
            >
              Отмена
            </button>
            <button
              className="btn btn-primary"
              onClick={() => reprint(reprintFor!)}
              disabled={busyCode === reprintFor}
            >
              Перепечатать
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
