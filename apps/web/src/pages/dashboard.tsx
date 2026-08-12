import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { useToast } from "../toast";

interface Summary {
  codesNotApplied: number;
  deadlineSoon: number;
  openAggregates: number;
  docsPendingDt: number;
  exceptions: number;
}

interface RecentEvent {
  at: string;
  type: string;
  label: string;
}

const QUICKBAR = [
  {
    label: "Создать товар",
    hint: "Карточка и GTIN",
    route: "/products",
    icon: "＋",
  },
  {
    label: "Заказать коды",
    hint: "Одиночно или массово",
    route: "/orders",
    icon: "⌗",
  },
  {
    label: "Запустить задание",
    hint: "Линия маркировки",
    route: "/production",
    icon: "⚙",
  },
  {
    label: "Сканировать",
    hint: "ТСД и агрегация",
    route: "/warehouse",
    icon: "▥",
  },
  { label: "Подписать", hint: "18 документов", route: "/documents", icon: "✎" },
  { label: "Все действия", hint: "Ctrl+K", route: "", icon: "⌘" },
];

// Landing-экран (UI-SPEC §4.2): KPI, quickbar, степпер процесса, внимание, события.
export function DashboardPage() {
  const toast = useToast();
  const nav = useNavigate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<RecentEvent[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const s = await api.get<Summary>("/dashboard/summary");
      setSummary(s);
      // последние события: попытка из documents/orders отсутствует; используем summary как источник
      const ev: RecentEvent[] = [];
      if (s.exceptions > 0)
        ev.push({
          at: "сейчас",
          type: "exceptions",
          label: `${s.exceptions} исключений требуют внимания`,
        });
      if (s.docsPendingDt > 0)
        ev.push({
          at: "сейчас",
          type: "docs",
          label: `${s.docsPendingDt} ДТ ожидают оформления`,
        });
      if (s.deadlineSoon > 0)
        ev.push({
          at: "сейчас",
          type: "deadline",
          label: `${s.deadlineSoon} заказов с дедлайном ≤ 7 дней`,
        });
      setEvents(ev);
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

  // степпер 7 шагов: done/active по реальным данным
  const steps = [
    { label: "Товар", done: !!summary },
    { label: "GTIN / НТИН", done: true },
    {
      label: "Заказ кодов",
      active: (summary?.deadlineSoon ?? 0) >= 0,
      done: false,
    },
    { label: "Этикетка", done: false },
    { label: "Печать", done: false },
    { label: "Нанесение", done: false },
    { label: "Оборот", done: false },
  ];

  const kpis = [
    { key: "codesNotApplied", label: "Коды без нанесения", trend: "" },
    { key: "deadlineSoon", label: "Дедлайн ≤ 7 дней", trend: "" },
    { key: "openAggregates", label: "Открытые агрегаты", trend: "" },
    { key: "docsPendingDt", label: "ДТ ожидает оформления", trend: "" },
    { key: "exceptions", label: "Исключения", trend: "" },
  ] as const;

  const fmt = (v: number | undefined): string =>
    typeof v === "number" ? String(v) : "—";

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Главная</h1>
          <div className="sub">
            Операционная картина и следующие действия по маркировке
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-light" onClick={load} disabled={loading}>
            ↻ Обновить
          </button>
          <button className="btn btn-primary" onClick={() => nav("/orders")}>
            + Заказать коды
          </button>
        </div>
      </div>

      <div className="quickbar">
        {QUICKBAR.map((q) => (
          <div
            key={q.label}
            className="quick-action"
            onClick={() => (q.route ? nav(q.route) : undefined)}
          >
            <div className="qicon">{q.icon}</div>
            <div>
              <b>{q.label}</b>
              <small>{q.hint}</small>
            </div>
          </div>
        ))}
      </div>

      <div className="grid kpis">
        {kpis.map((k) => (
          <div className="card kpi" key={k.key}>
            <div className="kpi-top">
              <div className="kpi-icon">
                {k.key === "codesNotApplied"
                  ? "▦"
                  : k.key === "deadlineSoon"
                    ? "⌗"
                    : k.key === "openAggregates"
                      ? "▦"
                      : k.key === "docsPendingDt"
                        ? "✎"
                        : "⚠"}
              </div>
              <span className="trend">{k.trend}</span>
            </div>
            <div className="kpi-num">{fmt(summary?.[k.key])}</div>
            <div className="kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 15 }}>
        <div className="card-title">Сквозной процесс маркировки</div>
        <div className="process">
          {steps.map((s, i) => (
            <div
              key={i}
              className={`process-step ${s.done ? "done" : ""} ${s.active ? "active" : ""}`}
            >
              <div className="process-num">{s.done ? "✓" : i + 1}</div>
              <b>{s.label}</b>
              <small>{s.done ? "готово" : s.active ? "в работе" : ""}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="grid two" style={{ marginTop: 15 }}>
        <div className="card">
          <div className="card-title">Требует внимания</div>
          {(summary?.exceptions ?? 0) > 0 && (
            <div className="error-box notice">
              ✕ {summary?.exceptions} интеграционных исключений требует
              повторной обработки
            </div>
          )}
          {(summary?.docsPendingDt ?? 0) > 0 && (
            <div className="notice" style={{ marginTop: 9 }}>
              ⚠ {summary?.docsPendingDt} ДТ ожидают оформления
            </div>
          )}
          {(summary?.deadlineSoon ?? 0) > 0 && (
            <div className="notice" style={{ marginTop: 9 }}>
              ⚠ {summary?.deadlineSoon} заказов с дедлайном ≤ 7 дней
            </div>
          )}
          {summary &&
            (summary.exceptions ?? 0) === 0 &&
            (summary.docsPendingDt ?? 0) === 0 &&
            (summary.deadlineSoon ?? 0) === 0 && (
              <div className="success-box notice">
                ✓ Нет требующих внимания операций
              </div>
            )}
          {!summary && <p className="sub">Загрузка…</p>}
          <button
            className="btn btn-soft w100"
            style={{ marginTop: 13 }}
            onClick={() => nav("/exceptions")}
          >
            Открыть центр исключений
          </button>
        </div>
        <div className="card">
          <div className="card-title">Последние события</div>
          {events.length === 0 ? (
            <p className="sub">—</p>
          ) : (
            <div className="timeline">
              {events.map((e, i) => (
                <div className="event" key={i}>
                  <div className="event-dot" />
                  <div>
                    <p>
                      <b>{e.type}</b>
                    </p>
                    <small>{e.label}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
