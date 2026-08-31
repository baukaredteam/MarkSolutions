import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { sessionStore } from "../session";
import { useToast } from "../toast";

interface Summary {
  codesNotApplied: number;
  deadlineSoon: number;
  openAggregates: number;
  docsPendingDt: number;
  exceptions: number;
  openTasks: number;
}

interface IntegrationRow {
  id: string;
  name: string;
  mode: string;
  errors?: number;
  queue?: number;
}

interface AttentionItem {
  badge: string;
  badgeClass: string;
  title: string;
  sub: string;
  route: string;
}

type IntegrationDisplay = {
  id: string;
  name: string;
  status: string;
  tone: "ok" | "warn" | "muted" | "unknown";
};

const HOME_INTEGRATIONS: { id: string; name: string }[] = [
  { id: "mpt", name: "ИС МПТ" },
  { id: "nkt", name: "НКТ" },
  { id: "gs1", name: "GS1" },
  { id: "1c", name: "1С" },
  { id: "esf", name: "ЭСФ" },
  { id: "customs", name: "Таможня" },
];

const QUICK_LINKS = [
  {
    label: "Центр задач",
    route: "/tasks",
    className: "home-quick-link home-quick-link--blue",
  },
  {
    label: "Глобальный поиск",
    route: "/search",
    className: "home-quick-link home-quick-link--dark",
  },
  {
    label: "Заказать коды",
    route: "/orders",
    className: "home-quick-link home-quick-link--green",
  },
  {
    label: "Создать поставку",
    route: "/shipments",
    className: "home-quick-link home-quick-link--violet",
  },
] as const;

const ROLE_LABELS: Record<string, string> = {
  admin: "Руководитель",
  manager: "Руководитель",
  accountant: "Бухгалтер",
  marking: "Специалист по маркировке",
  warehouse: "Складской оператор",
  viewer: "Наблюдатель",
  operator: "Оператор платформы",
};

function fmtCount(v: number | undefined): string {
  return typeof v === "number" ? v.toLocaleString("ru-RU") : "—";
}

function homeRoleLabel(roles: string[] | undefined): string {
  if (!roles?.length) return "—";
  if (roles.includes("manager") || roles.includes("admin"))
    return "Руководитель";
  return ROLE_LABELS[roles[0]] ?? roles[0];
}

function attentionKpiTotal(summary: Summary): number {
  // HOME KPI «Требуют внимания» = OPEN Task count. codesNotApplied stays on its card.
  return summary.openTasks;
}

function criticalCount(summary: Summary): number {
  return summary.openTasks;
}

function integrationStatus(
  row: IntegrationRow | undefined
): IntegrationDisplay {
  if (!row) {
    return { id: "", name: "", status: "нет данных", tone: "unknown" };
  }
  if ((row.errors ?? 0) > 0) {
    return {
      id: row.id,
      name: row.name,
      status: `Ошибки: ${row.errors}`,
      tone: "warn",
    };
  }
  if ((row.queue ?? 0) > 0) {
    return {
      id: row.id,
      name: row.name,
      status: `Очередь: ${row.queue}`,
      tone: "warn",
    };
  }
  if (row.mode === "http") {
    return { id: row.id, name: row.name, status: "Подключено", tone: "ok" };
  }
  if (row.mode === "mock") {
    return { id: row.id, name: row.name, status: "Мок (dev)", tone: "muted" };
  }
  return { id: row.id, name: row.name, status: "нет данных", tone: "unknown" };
}

function buildAttentionItems(
  summary: Summary | null,
  cardsMissingGtin: number
): AttentionItem[] {
  if (!summary) return [];
  const items: AttentionItem[] = [];
  if (summary.openTasks > 0) {
    items.push({
      badge: "SLA",
      badgeClass: "b-red",
      title: "Открытые задачи",
      sub: `${summary.openTasks} записей (outbox FAILED, алерты нанесения)`,
      route: "/tasks",
    });
  }
  if (summary.docsPendingDt > 0) {
    items.push({
      badge: "SLA",
      badgeClass: "b-red",
      title: "ДТ ожидают оформления",
      sub: `${summary.docsPendingDt} документов`,
      route: "/documents",
    });
  }
  if (summary.deadlineSoon > 0) {
    items.push({
      badge: "SLA",
      badgeClass: "b-red",
      title: "Заказы с дедлайном ≤ 7 дней",
      sub: `${summary.deadlineSoon} заказов`,
      route: "/orders",
    });
  }
  if (cardsMissingGtin > 0) {
    items.push({
      badge: "ТОВАР",
      badgeClass: "b-yellow",
      title: "Карточка без GTIN",
      sub: `${cardsMissingGtin} карточек`,
      route: "/products",
    });
  }
  return items;
}

function countMissingGtin(
  cards: { gtin?: string | null }[],
  drafts: { proposed?: { gtin?: string } }[]
): number {
  const cardCount = cards.filter((c) => !c.gtin?.trim()).length;
  const draftCount = drafts.filter((d) => !d.proposed?.gtin?.trim()).length;
  return cardCount + draftCount;
}

// HOME-01: read-model дашборда «Главная» (роль Руководитель) — GET /dashboard/summary
// + GET /integrations/status (+ опционально GET /products/cards|drafts для ТОВАР).
export function DashboardPage() {
  const toast = useToast();
  const nav = useNavigate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationRow[] | null>(
    null
  );
  const [cardsMissingGtin, setCardsMissingGtin] = useState(0);
  const [loading, setLoading] = useState(false);
  const roleLabel = homeRoleLabel(sessionStore.get()?.roles);

  async function load() {
    setLoading(true);
    try {
      const [s, i, cardsRes, draftsRes] = await Promise.all([
        api.get<Summary>("/dashboard/summary"),
        api.get<{ items: IntegrationRow[] }>("/integrations/status"),
        api
          .get<{ items: { gtin?: string | null }[] }>("/products/cards")
          .catch(() => ({ items: [] as { gtin?: string | null }[] })),
        api
          .get<{ items: { proposed?: { gtin?: string } }[] }>(
            "/products/drafts"
          )
          .catch(() => ({ items: [] as { proposed?: { gtin?: string } }[] })),
      ]);
      setSummary(s);
      setIntegrations(i.items);
      setCardsMissingGtin(countMissingGtin(cardsRes.items, draftsRes.items));
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

  const attentionItems = useMemo(
    () => buildAttentionItems(summary, cardsMissingGtin),
    [summary, cardsMissingGtin]
  );

  const attentionTotal = summary == null ? 0 : attentionKpiTotal(summary);

  const critical = summary == null ? 0 : criticalCount(summary);

  const isHomeEmpty =
    summary != null && attentionTotal === 0 && attentionItems.length === 0;

  const integrationById = useMemo(() => {
    const map = new Map<string, IntegrationRow>();
    for (const row of integrations ?? []) map.set(row.id, row);
    return map;
  }, [integrations]);

  const integrationCards = HOME_INTEGRATIONS.map(({ id, name }) => {
    const row = integrationById.get(id);
    const { status, tone } = integrationStatus(row);
    return { id, name, status, tone };
  });

  return (
    <section className="home-dashboard">
      <div className="page-head">
        <div>
          <div className="home-crumb">Главная / HOME-01</div>
          <h1>Главная</h1>
          <div className="sub">
            Единая точка контроля маркировки: процессы, риски, задачи и
            состояние интеграций.
          </div>
        </div>
        <div className="page-actions">
          <span className="home-role-chip">
            Роль: {roleLabel} <span aria-hidden="true">▾</span>
          </span>
          <button className="btn btn-light" onClick={load} disabled={loading}>
            ↻ Обновить
          </button>
        </div>
      </div>

      <div className="home-panel">
        {isHomeEmpty && (
          <div className="card home-empty-state">
            <h2>Данных пока недостаточно</h2>
            <p className="sub">
              После начала работы здесь появятся ключевые показатели, рабочая
              динамика и задачи, требующие внимания.
            </p>
            <div className="home-empty-actions">
              <button
                className="btn btn-primary"
                onClick={() => nav("/orders")}
              >
                Создать первый заказ кодов
              </button>
              <button className="btn btn-light" onClick={() => nav("/search")}>
                Открыть Глобальный поиск
              </button>
            </div>
          </div>
        )}

        <div className="grid four home-kpis">
          <div className="card home-kpi home-kpi--green">
            <div className="home-kpi-title">Операции сегодня</div>
            <div className="home-kpi-num">—</div>
            <div className="home-kpi-sub">нет данных</div>
          </div>
          <div className="card home-kpi home-kpi--red">
            <div className="home-kpi-title">Требуют внимания</div>
            <div className="home-kpi-num">{fmtCount(attentionTotal)}</div>
            <div className="home-kpi-sub">
              {summary == null
                ? "загрузка…"
                : critical > 0
                  ? `${critical} критичных`
                  : attentionTotal > 0
                    ? "без критичных SLA"
                    : "нет задач, требующих внимания"}
            </div>
          </div>
          <div className="card home-kpi home-kpi--orange">
            <div className="home-kpi-title">Активные поставки</div>
            <div className="home-kpi-num">—</div>
            <div className="home-kpi-sub">модуль поставок — нет</div>
          </div>
          <div className="card home-kpi home-kpi--purple">
            <div className="home-kpi-title">Кодов в работе</div>
            <div className="home-kpi-num">
              {fmtCount(summary?.codesNotApplied)}
            </div>
            <div className="home-kpi-sub">заказ / печать / нанесение</div>
          </div>
        </div>

        <div className="grid two home-middle" style={{ marginTop: 15 }}>
          <div className="card">
            <div className="card-title">Рабочая динамика</div>
            <div className="sub" style={{ marginBottom: 12 }}>
              Операции за последние 7 дней
            </div>
            <div className="chart home-dynamics-chart">
              <span className="home-dynamics-empty">Нет данных</span>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Требуют внимания</div>
            <div className="sub" style={{ marginBottom: 12 }}>
              Приоритетные задачи текущей роли
            </div>
            {!summary && <p className="sub">Загрузка…</p>}
            {summary && attentionItems.length === 0 && !isHomeEmpty && (
              <div className="success-box notice">
                ✓ Нет задач, требующих внимания
              </div>
            )}
            {attentionItems.map((item) => (
              <div className="home-attention-item" key={item.title}>
                <div className="home-attention-main">
                  <span className={`badge ${item.badgeClass}`}>
                    {item.badge}
                  </span>
                  <div>
                    <b>{item.title}</b>
                    <small className="sub">{item.sub}</small>
                  </div>
                </div>
                <button
                  className="btn btn-soft btn-sm"
                  onClick={() => nav(item.route)}
                >
                  Открыть
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginTop: 15 }}>
          <div className="card-title">Состояние интеграций</div>
          <div className="sub" style={{ marginBottom: 14 }}>
            Техническая готовность внешних систем и обмена данными
          </div>
          {integrations == null ? (
            <p className="sub">Загрузка…</p>
          ) : (
            <>
              <div className="home-integration-grid">
                {integrationCards.map((it) => (
                  <div className="home-integration-item" key={it.id}>
                    <span
                      className={`home-integration-dot home-integration-dot--${it.tone}`}
                    />
                    <div>
                      <b>{it.name}</b>
                      <small className="sub">{it.status}</small>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  className="btn btn-soft btn-sm"
                  onClick={() => nav("/integrations")}
                >
                  Подробнее
                </button>
              </div>
            </>
          )}
        </div>

        <div className="home-quick-links" style={{ marginTop: 15 }}>
          {QUICK_LINKS.map((link) => (
            <button
              key={link.label}
              type="button"
              className={link.className}
              onClick={() => nav(link.route)}
            >
              {link.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
