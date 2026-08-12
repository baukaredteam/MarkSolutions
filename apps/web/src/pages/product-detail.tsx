import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { StatusBadge } from "../badge";
import { useToast } from "../toast";

interface CardDetail {
  id: string;
  gtin: string | null;
  ntin: string | null;
  status: string;
  attributes: Record<string, unknown>;
  audit: { at: string; actor: string; action: string }[];
  updatedAt: string;
}

interface CodeRow {
  id: string;
  gtin: string;
  mask: string;
  status: string;
}

// Product detail (UI-SPEC §4.5): header, табы, действия (duplicate/submit/edit).
export function ProductDetailPage() {
  const toast = useToast();
  const nav = useNavigate();
  const { id } = useParams();
  const [card, setCard] = useState<CardDetail | null>(null);
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [tab, setTab] = useState("main");
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!id || id === "new") return;
    setLoading(true);
    try {
      const c = await api.get<CardDetail>(`/products/cards/${id}`);
      setCard(c);
      // коды товара: masks по gtin
      const m = await api
        .get<{ items: { orderId: string }[] }>("/api/codes")
        .catch(() => ({ items: [] }));
      if (m.items.length > 0) {
        const oid = m.items[0].orderId;
        const det = await api
          .get<{ items: CodeRow[] }>(`/codes/${oid}/codes`)
          .catch(() => ({ items: [] }));
        setCodes(det.items.filter((x) => x.gtin === c.gtin));
      }
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function duplicate() {
    try {
      const r = await api.post<{ id: string }>(
        `/products/cards/${id}/clone`,
        {}
      );
      toast.push("Создана копия карточки (DRAFT)");
      nav(`/productDetail/${r.id}`);
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
    }
  }

  async function submit() {
    try {
      await api.post(`/products/cards/${id}/submit`, {});
      toast.push("Карточка отправлена на модерацию");
      load();
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
    }
  }

  if (id === "new") {
    return (
      <section>
        <div className="page-head">
          <div>
            <h1>Карточка товара (новый)</h1>
            <div className="sub">Создайте карточку на вкладке «Товары»</div>
          </div>
        </div>
        <div className="card">
          <p className="sub">
            Используйте форму «+ Создать товар» на экране каталога.
          </p>
          <button className="btn btn-primary" onClick={() => nav("/products")}>
            К каталогу
          </button>
        </div>
      </section>
    );
  }

  if (!card) {
    return (
      <section>
        <div className="page-head">
          <h1>Карточка товара</h1>
        </div>
        <div className="card">
          <p className="sub">{loading ? "Загрузка…" : "Карточка не найдена"}</p>
        </div>
      </section>
    );
  }

  const a = card.attributes;
  const tierA = [
    ["Наименование", a.name],
    ["Бренд", a.brand],
    ["Состав", a.composition],
    ["Срок годности", a.shelfLifeMonths],
    ["Объём", a.volumeL],
    ["SAE", a.sae],
    ["ТН ВЭД", a.tnved],
    ["Группа", a.group],
    ["Категория", a.category],
  ] as const;

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="crumb">Каталог / {String(a.name ?? card.gtin)}</div>
          <h1>Карточка товара</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-light" onClick={duplicate}>
            Дублировать
          </button>
          <button className="btn btn-light" onClick={submit}>
            Отправить на модерацию
          </button>
          <button
            className="btn btn-primary"
            onClick={() =>
              toast.push("Редактирование — эволюция (CAT-011)", "warn")
            }
          >
            Редактировать
          </button>
        </div>
      </div>

      <div className="card">
        <div className="product-head">
          <div className="product-photo">🛢️</div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2 style={{ margin: 0 }}>{String(a.name ?? "—")}</h2>
              <StatusBadge code={card.status} />
            </div>
            <p className="sub">
              GTIN {card.gtin ?? "—"} · НТИН {card.ntin ?? "—"}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <span className="badge b-blue">{String(a.group ?? "—")}</span>
              <span className="badge b-gray">
                {String(a.packageType ?? "—")}
              </span>
            </div>
          </div>
          <div className="spacer" />
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab ${tab === "main" ? "active" : ""}`}
          onClick={() => setTab("main")}
        >
          Основная информация
        </button>
        <button
          className={`tab ${tab === "units" ? "active" : ""}`}
          onClick={() => setTab("units")}
        >
          Юниты и упаковки
        </button>
        <button
          className={`tab ${tab === "codes" ? "active" : ""}`}
          onClick={() => setTab("codes")}
        >
          Коды
        </button>
        <button
          className={`tab ${tab === "labels" ? "active" : ""}`}
          onClick={() => setTab("labels")}
        >
          Этикетки
        </button>
        <button
          className={`tab ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          История и версии
        </button>
      </div>

      {tab === "main" && (
        <div className="grid two">
          <div className="card">
            <div className="card-title">Идентификация и классификация</div>
            <div className="info-grid">
              {tierA.map(([k, v]) => (
                <div className="info-box" key={k}>
                  <small>{k}</small>
                  <b>{String(v ?? "—")}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "units" && (
        <div className="card">
          <div className="card-title">Юниты и упаковки</div>
          <p className="sub">
            {a.packageType
              ? `${a.packageType} · объём ${a.volumeL ?? "—"} · вес ${a.grossWeightKg ?? "—"} кг`
              : "—"}
          </p>
        </div>
      )}

      {tab === "codes" && (
        <div className="card">
          <div className="card-title">
            Коды товара (маски, без полных serial)
          </div>
          {codes.length === 0 ? (
            <p className="sub">Нет кодов</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Маска КМ</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((c) => (
                    <tr key={c.id}>
                      <td>{c.mask}</td>
                      <td>
                        <StatusBadge code={c.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "labels" && (
        <div className="card">
          <div className="card-title">Этикетки</div>
          <p className="sub">Конструктор этикеток — тикет UI-06 (labels).</p>
        </div>
      )}

      {tab === "history" && (
        <div className="card">
          <div className="card-title">История и версии</div>
          {card.audit.length === 0 ? (
            <p className="sub">Нет событий</p>
          ) : (
            <div className="timeline">
              {card.audit.map((h, i) => (
                <div className="event" key={i}>
                  <div className="event-dot" />
                  <div>
                    <p>
                      <b>{h.action}</b> · {h.actor}
                    </p>
                    <small>{new Date(h.at).toLocaleString()}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
