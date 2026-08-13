import { useEffect, useMemo, useState } from "react";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { formatTenge } from "../money";
import { sessionStore } from "../session";
import { useToast } from "../toast";
import { EntityList, type Column } from "../entity-list";
import { StatusBadge } from "../badge";

interface Balance {
  balance: string;
  reserved: string;
  available: string;
}

interface LedgerRow {
  id: string;
  date: string;
  kind: string;
  amount: string;
  ref1c: string | null;
  refOrderId: string | null;
  reason: string | null;
  balance: string;
}

const WRITE_ROLES = ["admin", "accountant"];
const LIMIT_WARN = 10_000_000n; // 100 000 ₸ в тиынах (W5-07)

interface InvoiceRow {
  id: string;
  number: string;
  productGroup: string;
  quantity: number;
  unitPrice: string;
  sumWithoutVat: string;
  vat: string;
  sumWithVat: string;
  status: string;
  paymentRef: string | null;
}

const PRODUCT_GROUPS: [string, string][] = [
  ["motor-oils", "Моторные масла"],
  ["medicines", "Лекарства"],
  ["footwear", "Обувь"],
  ["tobacco", "Табак"],
  ["dietary-supplements", "БАД"],
  ["light-industry", "Лёгкая промышленность"],
];

function fmtTenge(v: bigint | string): string {
  return formatTenge(BigInt(v));
}

// Биллинг (UI-SPEC §4.13): KPI-3, пополнение-drawer (ref1c идемпотентно),
// таблица проводок LedgerEntry, закрывающие документы (заглушка), расходы по дням.
export function BalancePage() {
  const toast = useToast();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [showTopup, setShowTopup] = useState(false);
  const [ref1c, setRef1c] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invGroup, setInvGroup] = useState("motor-oils");
  const [invQty, setInvQty] = useState("");

  const sess = sessionStore.get();
  const roles = sess?.roles ?? [];
  const canWrite = WRITE_ROLES.some((r) => roles.includes(r));

  async function load() {
    setLoading(true);
    try {
      const b = await api.get<Balance>("/billing/balance");
      setBalance(b);
      const l = await api
        .get<{ items: LedgerRow[] }>("/billing/ledger")
        .catch(() => ({ items: [] }));
      setLedger(l.items);
      const inv = await api
        .get<{ items: InvoiceRow[] }>("/billing/invoices")
        .catch(() => ({ items: [] }));
      setInvoices(inv.items);
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
    load();
  }, []);

  // Расходы за месяц = сумма SETTLE с начала месяца
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthSpend = ledger
    .filter((e) => e.kind === "SETTLE" && new Date(e.date) >= monthStart)
    .reduce((s, e) => s + Number(e.amount), 0);

  const available = Number(balance?.available ?? 0);
  const low = available < LIMIT_WARN;

  // Расходы по дням: последние 7 дней SETTLE (для SVG)
  const spendByDay = useMemo(() => {
    const days: number[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const sum = ledger
        .filter((e) => {
          if (e.kind !== "SETTLE") return false;
          const ed = new Date(e.date);
          return (
            ed.getFullYear() === d.getFullYear() &&
            ed.getMonth() === d.getMonth() &&
            ed.getDate() === d.getDate()
          );
        })
        .reduce((s, e) => s + Number(e.amount), 0);
      days.push(sum);
    }
    return days;
  }, [ledger]);

  const maxSpend = Math.max(...spendByDay, 1);
  const chartPoints = spendByDay
    .map((v, i) => {
      const x = (i / (spendByDay.length - 1)) * 500;
      const y = 180 - (v / maxSpend) * 160;
      return `${Math.round(x)},${Math.round(y)}`;
    })
    .join(" ");

  async function topUp() {
    if (!ref1c.trim() || !amount.trim()) {
      toast.push("Укажите ref1c и сумму", "warn");
      return;
    }
    setLoading(true);
    try {
      const { status } = await api.postRaw<{ id: string }>(
        "/billing/payments/import",
        {
          ref1c: ref1c.trim(),
          amount: amount.trim(),
          reason: reason.trim() || "пополнение из 1С",
        }
      );
      if (status === 200) {
        toast.push("Проводка уже существует (идемпотентно по ref1c)");
      } else {
        toast.push("Проведено");
      }
      setRef1c("");
      setAmount("");
      setReason("");
      setShowTopup(false);
      await load();
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.", "error");
    } finally {
      setLoading(false);
    }
  }

  // W5-07: выставить счёт (кол-во + группа) → авторасчёт НДС → POST /billing/invoices
  async function createInvoice() {
    const qty = Number(invQty);
    if (!Number.isInteger(qty) || qty < 1) {
      toast.push("Укажите количество кодов", "warn");
      return;
    }
    setLoading(true);
    try {
      const inv = await api.post<InvoiceRow>("/billing/invoices", {
        productGroup: invGroup,
        quantity: qty,
      });
      toast.push(`Счёт ${inv.number} выставлен (${inv.status})`);
      setInvQty("");
      await load();
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.", "error");
    } finally {
      setLoading(false);
    }
  }

  // W5-07: «Оплатил(а)» → confirm → TOPUP(ref1c=номер) → PAID
  async function confirmInvoice(id: string, paymentRef: string) {
    setLoading(true);
    try {
      const inv = await api.post<InvoiceRow>(
        `/billing/invoices/${id}/confirm`,
        {
          paymentRef,
        }
      );
      toast.push(`Счёт ${inv.number} оплачен`);
      await load();
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.", "error");
    } finally {
      setLoading(false);
    }
  }

  const columns: Column<LedgerRow>[] = [
    {
      key: "date",
      label: "Дата",
      render: (r) =>
        new Date(r.date).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
    },
    {
      key: "kind",
      label: "Операция",
      render: (r) => <StatusBadge code={r.kind} />,
    },
    {
      key: "basis",
      label: "Основание",
      render: (r) =>
        r.ref1c ??
        (r.refOrderId ? `KM-заказ ${r.refOrderId.slice(0, 8)}` : "—"),
    },
    {
      key: "amount",
      label: "Сумма",
      render: (r) => {
        const sign = r.kind === "SETTLE" || r.kind === "RESERVE" ? "−" : "+";
        return (
          <span style={{ color: sign === "−" ? "var(--red)" : "var(--green)" }}>
            {sign}
            {fmtTenge(r.amount)}
          </span>
        );
      },
    },
    {
      key: "balance",
      label: "Баланс",
      render: (r) => fmtTenge(r.balance),
    },
    {
      key: "status",
      label: "Статус",
      render: (r) => {
        // Проведено/Закрыт/В обработке — проекция kind
        const st = r.kind === "RESERVE" ? "CLOSED" : "DONE";
        return (
          <span
            className={`badge ${st === "DONE" ? "b-green" : "b-gray"}`}
            data-status={st}
          >
            {st === "DONE" ? "Проведено" : "Закрыт"}
          </span>
        );
      },
    },
  ];

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Биллинг</h1>
          <div className="sub">
            Лицевые счета, платежи, резервы, списания, возвраты и закрывающие
            документы
          </div>
        </div>
        {canWrite && (
          <div className="page-actions">
            <button
              className="btn btn-light"
              onClick={() => toast.push("Сверка запущена")}
            >
              Сверка
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setShowTopup(true)}
            >
              Пополнить баланс
            </button>
          </div>
        )}
      </div>

      <div className="grid three">
        <div className="card">
          <small className="sub">Доступный баланс</small>
          <div
            className="kpi-num"
            style={{ color: low ? "var(--red)" : "var(--green)" }}
          >
            {fmtTenge(balance?.available ?? "0")}
          </div>
          <p className="sub">
            Зарезервировано: {fmtTenge(balance?.reserved ?? "0")}
          </p>
          {low && (
            <p className="sub" style={{ color: "var(--red)" }}>
              Баланс ниже лимита предупреждения
            </p>
          )}
        </div>
        <div className="card">
          <small className="sub">Расходы за месяц</small>
          <div className="kpi-num">{fmtTenge(String(monthSpend))}</div>
          <p className="sub">Списания (SETTLE) с начала месяца</p>
        </div>
        <div className="card">
          <small className="sub">Лимит предупреждения</small>
          <div className="kpi-num">{fmtTenge(LIMIT_WARN)}</div>
          <p className="sub">Автопополнение не настроено</p>
        </div>
      </div>

      <div className="grid two" style={{ marginTop: 15 }}>
        <div className="card">
          <div className="card-title">Операции лицевого счёта</div>
          <EntityList
            columns={columns}
            rows={ledger}
            rowKey={(r) => r.id}
            emptyText="Нет операций"
          />
        </div>
        <div className="card">
          <div className="card-title">Расходы по дням</div>
          <div className="chart">
            <svg
              viewBox="0 0 500 230"
              preserveAspectRatio="none"
              style={{ width: "100%" }}
            >
              <polyline
                points={chartPoints}
                fill="none"
                stroke="#3185e7"
                strokeWidth="4"
              />
            </svg>
          </div>
        </div>
      </div>

      {canWrite && (
        <div className="card" style={{ marginTop: 15 }}>
          <div className="card-title">Счета на оплату</div>
          <div className="grid two">
            <div className="card">
              <div className="card-title">Выставить счёт</div>
              <div className="field">
                <label htmlFor="inv-group">Товарная группа</label>
                <select
                  id="inv-group"
                  value={invGroup}
                  onChange={(e) => setInvGroup(e.target.value)}
                >
                  {PRODUCT_GROUPS.map(([g, label]) => (
                    <option key={g} value={g}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="inv-qty">Количество кодов</label>
                <input
                  id="inv-qty"
                  className="input"
                  type="number"
                  min={1}
                  value={invQty}
                  onChange={(e) => setInvQty(e.target.value)}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={createInvoice}
                disabled={loading}
              >
                Выставить счёт
              </button>
            </div>
            <div className="card">
              <div className="card-title">Список счетов</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>Группа</th>
                      <th>Кол-во</th>
                      <th>Сумма</th>
                      <th>Статус</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.length === 0 && (
                      <tr>
                        <td colSpan={6} className="empty">
                          Счетов нет
                        </td>
                      </tr>
                    )}
                    {invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td>
                          <b>{inv.number}</b>
                        </td>
                        <td>
                          {PRODUCT_GROUPS.find(
                            ([g]) => g === inv.productGroup
                          )?.[1] ?? inv.productGroup}
                        </td>
                        <td>{inv.quantity}</td>
                        <td>{fmtTenge(inv.sumWithVat)}</td>
                        <td>
                          <span
                            className={`badge ${inv.status === "PAID" ? "b-green" : inv.status === "CANCELLED" ? "b-gray" : "b-yellow"}`}
                            data-status={inv.status}
                          >
                            {inv.status === "PAID"
                              ? "Оплачен"
                              : inv.status === "CANCELLED"
                                ? "Отменён"
                                : "Выставлен"}
                          </span>
                        </td>
                        <td>
                          {inv.status === "ISSUED" && (
                            <>
                              <button
                                className="btn btn-light btn-sm"
                                onClick={() =>
                                  confirmInvoice(inv.id, `PAY-${inv.number}`)
                                }
                                disabled={loading}
                              >
                                Оплатил(а)
                              </button>{" "}
                              <button
                                className="btn btn-light btn-sm"
                                onClick={() =>
                                  toast.push(
                                    `Kaspi: оплата счёта ${inv.number} (мок)`
                                  )
                                }
                              >
                                Kaspi
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 15 }}>
        <div className="card-title">Закрывающие документы</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Период</th>
                <th>Счёт</th>
                <th>Акт</th>
                <th>Счёт-фактура</th>
                <th>Сумма</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="empty">
                  Документы появятся после активации закрывающих периодов
                  (эволюция тикета 05)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div
        className={`overlay ${showTopup ? "show" : ""}`}
        onClick={() => setShowTopup(false)}
      />
      <div className={`modal ${showTopup ? "show" : ""}`}>
        <div className="modal-card">
          <div className="modal-head">
            <h3>Пополнение баланса</h3>
            <button
              className="btn btn-light btn-sm"
              onClick={() => setShowTopup(false)}
            >
              ✕
            </button>
          </div>
          <p className="sub">
            Идемпотентно по ref1c: повтор той же проводки вернёт 200.
          </p>
          <div className="field">
            <label htmlFor="topup-ref1c">ref1c</label>
            <input
              id="topup-ref1c"
              className="input"
              placeholder="ref1c"
              value={ref1c}
              onChange={(e) => setRef1c(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="topup-amount">Сумма (тенге)</label>
            <input
              id="topup-amount"
              className="input"
              placeholder="Сумма (тенге)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="topup-reason">Причина</label>
            <input
              id="topup-reason"
              className="input"
              placeholder="пополнение из 1С"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
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
              onClick={() => setShowTopup(false)}
            >
              Отмена
            </button>
            <button
              className="btn btn-primary"
              onClick={topUp}
              disabled={loading}
            >
              Пополнить
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
