import { useEffect, useState } from "react";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { sessionStore } from "../session";
import { useToast } from "../toast";
import { EntityList, type Column } from "../entity-list";
import { StatusBadge } from "../badge";

interface DocRow {
  id: string;
  type: string;
  date: string;
  status: string;
  rejectReason: string | null;
}

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

const TYPE_LABEL: Record<string, string> = {
  IMPORT: "Ввод в оборот",
  WITHDRAWAL: "Вывод из оборота",
  UTILISATION: "Списание",
};

const WITHDRAWAL_REASONS: [string, string][] = [
  ["DEFECT", "Брак"],
  ["LOST", "Утрата"],
  ["EXPIRY", "Истечение срока"],
  ["RETURN_SUPPLIER", "Возврат поставщику"],
  ["DESTRUCTION", "Уничтожение"],
  ["OTHER", "Другое"],
];

// Роли с правом ввоза/вывода (совпадает с роль-гардом бэкенда)
const WRITE_ROLES = ["admin", "manager", "marking"];

// Документы (UI-SPEC §4.11): таблица документов + мастера «Оформить ввоз» и
// «Вывод/списание». Статусы — русские (UI-i18n).
export function DocumentsPage() {
  const toast = useToast();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [codes, setCodes] = useState<CodeItem[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [showWithdrawal, setShowWithdrawal] = useState(false);
  const [importOrderId, setImportOrderId] = useState("");
  const [dtDate, setDtDate] = useState("");
  const [dtNumber, setDtNumber] = useState("");
  const [dtAuthority, setDtAuthority] = useState("");
  const [withOrderId, setWithOrderId] = useState("");
  const [withCodes, setWithCodes] = useState<Set<string>>(new Set());
  const [withType, setWithType] = useState<"WITHDRAWAL" | "WRITE_OFF">(
    "WITHDRAWAL"
  );
  const [withReason, setWithReason] = useState("DEFECT");
  const [withComment, setWithComment] = useState("");
  const [withChildren, setWithChildren] = useState(false);
  const [busy, setBusy] = useState(false);

  const sess = sessionStore.get();
  const roles = sess?.roles ?? [];
  const canWrite = WRITE_ROLES.some((r) => roles.includes(r));

  async function load() {
    try {
      const d = await api.get<{ items: DocRow[] }>("/documents");
      setDocs(d.items);
      const o = await api
        .get<{ items: OrderOption[] }>("/orders")
        .catch(() => ({ items: [] }));
      setOrders(o.items);
      if (!importOrderId && o.items.length > 0) setImportOrderId(o.items[0].id);
      if (!withOrderId && o.items.length > 0) setWithOrderId(o.items[0].id);
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.", "error");
    }
  }

  async function loadCodes(orderId: string) {
    if (!orderId) return setCodes([]);
    try {
      const c = await api.get<{ items: CodeItem[] }>(`/codes/${orderId}/codes`);
      setCodes(c.items);
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    loadCodes(withOrderId);
  }, [withOrderId]);

  const kpis = [
    {
      label: "Черновики",
      value: docs.filter((d) => d.status === "SUBMITTED").length,
    },
    {
      label: "Ожидают обработки",
      value: docs.filter((d) =>
        ["IN_PROCESS", "PARTIALLY_PROCESSED"].includes(d.status)
      ).length,
    },
    {
      label: "Ошибки",
      value: docs.filter((d) => d.status === "ERROR").length,
    },
    {
      label: "Завершено",
      value: docs.filter((d) => d.status === "SUCCESS").length,
    },
  ];

  async function submitImport() {
    if (!dtDate || !dtNumber) {
      toast.push("400: дата и номер ДТ обязательны", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ status: string }>("/import", {
        orderId: importOrderId,
        customsDeclaration: {
          date: dtDate,
          number: dtNumber,
          authorityCode: dtAuthority || undefined,
        },
      });
      toast.push(
        res.status === "SUCCESS"
          ? "Ввод в оборот: завершено (INTRODUCED)"
          : `Ввод в оборот: ${res.status}`,
        res.status === "SUCCESS" ? "info" : "error"
      );
      setShowImport(false);
      setDtDate("");
      setDtNumber("");
      setDtAuthority("");
      load();
    } catch (e) {
      if (e instanceof ApiErrorResponse) {
        const msg =
          e.error.code === 409
            ? `409: ДТ уже зарегистрирована`
            : `${e.error.code}: ${e.error.message}`;
        toast.push(msg, "error");
      } else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function submitWithdrawal() {
    const codeList = [...withCodes];
    if (codeList.length === 0) {
      toast.push("400: выберите коды", "error");
      return;
    }
    if (withReason === "OTHER" && withComment.trim().length < 5) {
      toast.push(
        "400: для OTHER требуется комментарий (мин. 5 символов)",
        "error"
      );
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ status: string }>("/withdrawal", {
        codes: codeList,
        withdrawalType: withType,
        withdrawalReason: withReason,
        comment: withComment || undefined,
        childrenWriteOff: withChildren,
      });
      toast.push(
        res.status === "SUCCESS"
          ? withType === "WRITE_OFF"
            ? "Списание: завершено (WRITTEN_OFF)"
            : "Вывод из оборота: завершено (WITHDRAWN)"
          : `Вывод: ${res.status}`,
        res.status === "SUCCESS" ? "info" : "error"
      );
      setShowWithdrawal(false);
      setWithCodes(new Set());
      setWithComment("");
      load();
    } catch (e) {
      if (e instanceof ApiErrorResponse) {
        const msg =
          e.error.code === 409
            ? `409: ${e.error.message}`
            : `${e.error.code}: ${e.error.message}`;
        toast.push(msg, "error");
      } else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.", "error");
    } finally {
      setBusy(false);
    }
  }

  function toggleCode(id: string) {
    setWithCodes((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const columns: Column<DocRow>[] = [
    { key: "id", label: "Документ", render: (r) => <b>{r.id.slice(0, 14)}</b> },
    {
      key: "type",
      label: "Тип",
      render: (r) => TYPE_LABEL[r.type] ?? r.type,
    },
    {
      key: "status",
      label: "Статус",
      render: (r) => <StatusBadge code={r.status} />,
    },
    {
      key: "rejectReason",
      label: "Причина отказа",
      render: (r) => r.rejectReason ?? "—",
    },
    {
      key: "date",
      label: "Дата",
      render: (r) => new Date(r.date).toLocaleDateString(),
    },
  ];

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Документы</h1>
          <div className="sub">
            Документы движения, подтверждения и сверка внешних статусов
          </div>
        </div>
        {canWrite && (
          <div className="page-actions">
            <button
              className="btn btn-light"
              onClick={() => setShowImport(true)}
            >
              Оформить ввоз
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setShowWithdrawal(true)}
            >
              Вывод/списание
            </button>
          </div>
        )}
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
          <button className="btn btn-light" onClick={load}>
            ↻ Обновить
          </button>
        </div>
        <EntityList
          columns={columns}
          rows={docs}
          rowKey={(r) => r.id}
          emptyText="Нет документов"
        />
      </div>

      {/* Мастер «Оформить ввоз» */}
      <div
        className={`overlay ${showImport ? "show" : ""}`}
        onClick={() => setShowImport(false)}
      />
      <div className={`modal ${showImport ? "show" : ""}`}>
        <div className="modal-card">
          <div className="modal-head">
            <h3>Оформление ввоза (Импорт)</h3>
            <button
              className="btn btn-light btn-sm"
              onClick={() => setShowImport(false)}
            >
              ✕
            </button>
          </div>
          <p className="sub">
            Заказ → ДТ (декларация). После отправки все нанесённые коды станут
            «В обороте».
          </p>
          <div className="field">
            <label htmlFor="imp-order">Заказ</label>
            <select
              id="imp-order"
              value={importOrderId}
              onChange={(e) => setImportOrderId(e.target.value)}
            >
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  KM-2026-{String(o.number ?? 0).padStart(6, "0")} · {o.gtin} ·{" "}
                  {o.status}
                </option>
              ))}
            </select>
          </div>
          <div className="form-grid two">
            <div className="field">
              <label htmlFor="imp-date">Дата ДТ</label>
              <input
                id="imp-date"
                type="date"
                className="input"
                value={dtDate}
                onChange={(e) => setDtDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="imp-number">Номер ДТ</label>
              <input
                id="imp-number"
                className="input"
                placeholder="10002000/010826/12345"
                value={dtNumber}
                onChange={(e) => setDtNumber(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="imp-authority">Код таможни (опц.)</label>
            <input
              id="imp-authority"
              className="input"
              placeholder="702"
              value={dtAuthority}
              onChange={(e) => setDtAuthority(e.target.value)}
            />
          </div>
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
              onClick={() => setShowImport(false)}
            >
              Отмена
            </button>
            <button
              className="btn btn-primary"
              onClick={submitImport}
              disabled={busy}
            >
              Отправить ввоз
            </button>
          </div>
        </div>
      </div>

      {/* Мастер «Вывод/списание» */}
      <div
        className={`overlay ${showWithdrawal ? "show" : ""}`}
        onClick={() => setShowWithdrawal(false)}
      />
      <div className={`modal ${showWithdrawal ? "show" : ""}`}>
        <div className="modal-card">
          <div className="modal-head">
            <h3>Вывод из оборота / списание</h3>
            <button
              className="btn btn-light btn-sm"
              onClick={() => setShowWithdrawal(false)}
            >
              ✕
            </button>
          </div>
          <p className="sub">Выберите коды и укажите причину вывода.</p>
          <div className="field">
            <label htmlFor="with-order">Заказ</label>
            <select
              id="with-order"
              value={withOrderId}
              onChange={(e) => {
                setWithOrderId(e.target.value);
                setWithCodes(new Set());
              }}
            >
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  KM-2026-{String(o.number ?? 0).padStart(6, "0")} · {o.gtin}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Коды</label>
            <div style={{ maxHeight: 180, overflow: "auto" }}>
              {codes.length === 0 && <p className="sub">Нет кодов в заказе</p>}
              {codes.map((c) => (
                <label key={c.id} style={{ display: "block", margin: "4px 0" }}>
                  <input
                    type="checkbox"
                    checked={withCodes.has(c.id)}
                    onChange={() => toggleCode(c.id)}
                    aria-label={c.mask}
                  />{" "}
                  {c.mask} · <StatusBadge code={c.status} />
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <label htmlFor="with-type">Тип</label>
            <select
              id="with-type"
              value={withType}
              onChange={(e) =>
                setWithType(e.target.value as "WITHDRAWAL" | "WRITE_OFF")
              }
            >
              <option value="WITHDRAWAL">Вывод из оборота</option>
              <option value="WRITE_OFF">Списание</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="with-reason">Причина</label>
            <select
              id="with-reason"
              value={withReason}
              onChange={(e) => setWithReason(e.target.value)}
            >
              {WITHDRAWAL_REASONS.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {withReason === "OTHER" && (
            <div className="field">
              <label htmlFor="with-comment">Комментарий (мин. 5)</label>
              <input
                id="with-comment"
                className="input"
                value={withComment}
                onChange={(e) => setWithComment(e.target.value)}
              />
            </div>
          )}
          <label style={{ display: "block", margin: "10px 0" }}>
            <input
              type="checkbox"
              checked={withChildren}
              onChange={(e) => setWithChildren(e.target.checked)}
            />{" "}
            Списать вложенные (агрегат)
          </label>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
            }}
          >
            <button
              className="btn btn-light"
              onClick={() => setShowWithdrawal(false)}
            >
              Отмена
            </button>
            <button
              className="btn btn-primary"
              onClick={submitWithdrawal}
              disabled={busy}
            >
              Отправить вывод
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
