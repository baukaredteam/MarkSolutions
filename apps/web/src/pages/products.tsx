import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { useToast } from "../toast";
import { EntityList, type Column } from "../entity-list";
import { sessionStore } from "../session";

interface CardRow {
  id: string;
  name: string | null;
  gtin: string | null;
  ntin: string | null;
  status: string;
  updatedAt: string;
}

interface DraftRow {
  id: string;
  status: string;
  proposed: {
    name?: string;
    tnved?: string;
    tnvedHint?: string | null;
    strengthenFix?: boolean;
    gtin?: string;
    gtinManual?: boolean;
  };
  demo?: boolean;
  audit?: { action: string }[];
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "b-gray",
  VALIDATING: "b-yellow",
  SUBMITTED: "b-blue",
  IN_REVIEW: "b-blue",
  NEEDS_CORRECTION: "b-red",
  APPROVED: "b-green",
  REGISTERING: "b-yellow",
  REGISTERED: "b-green",
  REJECTED: "b-red",
  SUSPENDED: "b-yellow",
};

const IN_LIST = ["2710198200", "3403191000", "3403199000", "3403990000"];

interface CardForm {
  name: string;
  gtin: string;
  brand: string;
  tnved: string;
  composition: string;
  shelfLifeMonths: string;
  volumeL: string;
  sae: string;
}

const EMPTY_FORM: CardForm = {
  name: "",
  gtin: "",
  brand: "",
  tnved: "2710198200",
  composition: "синтетическое",
  shelfLifeMonths: "60",
  volumeL: "4",
  sae: "5W-30",
};

export function ProductsPage() {
  const toast = useToast();
  const nav = useNavigate();
  const [cards, setCards] = useState<CardRow[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tab, setTab] = useState<"cards" | "drafts">("cards");
  const [, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [jsonRows, setJsonRows] = useState("");
  const [form, setForm] = useState<CardForm>(EMPTY_FORM);

  async function load() {
    setLoading(true);
    try {
      const c = await api.get<{ items: CardRow[] }>("/products/cards");
      setCards(c.items);
      const d = await api
        .get<{ items: DraftRow[] }>("/products/drafts")
        .catch(() => ({ items: [] }));
      setDrafts(d.items);
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

  // «⇩ Шаблон импорта»: скачать xlsx (GET /templates/:group)
  async function downloadTemplate() {
    try {
      const sess = sessionStore.get();
      const res = await fetch("/api/templates/motor-oils", {
        headers: { Authorization: `Bearer ${sess?.token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "motor-oils-v1.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast.push("Шаблон скачан");
    } catch (e) {
      toast.push(`Не удалось скачать шаблон: ${(e as Error).message}`, "error");
    }
  }

  // «⇧ Импорт»: JSON rows → POST /products/drafts/import
  async function importRows() {
    try {
      let rows: { name?: string; gtin?: string; tnved?: string }[];
      try {
        rows = JSON.parse(jsonRows);
      } catch {
        toast.push("Некорректный JSON", "error");
        return;
      }
      const res = await api.post<{ created: number }>(
        "/products/drafts/import",
        { rows }
      );
      toast.push(`Импортировано черновиков: ${res.created}`);
      setShowImport(false);
      setJsonRows("");
      load();
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен", "error");
    }
  }

  async function seedInvoice() {
    try {
      const res = await api.post<{ count: number }>("/demo/seed-invoice", {});
      toast.push(`Загружено ${res.count} черновиков`);
      load();
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
    }
  }

  // Мастер создания карточки (4 шага) → POST /products/cards (admin|manager)
  async function createCard() {
    const attrs: Record<string, unknown> = {
      schemaVersion: 1,
      gtin: form.gtin,
      name: form.name,
      brand: form.brand || "—",
      countryOfBrand: "KZ",
      composition: form.composition,
      shelfLifeMonths: Number(form.shelfLifeMonths),
      productType: "моторное масло",
      volumeL: Number(form.volumeL),
      purpose: "легковые",
      sae: form.sae,
      storage: "сухое",
      conformityMark: "нет",
      eacMarks: "нет",
      grossWeightKg: 3.8,
      tnved: form.tnved,
      group: "Моторные масла",
      category: "Моторные масла",
      packageType: "Единица товара",
      kpved: "19.20.29",
      gpc: "10005267",
      ownerGcp: "0401483",
      ownerName: "Demo",
      ownerCountry: "KZ",
      ownerAddress: "Астана",
      platformName: "1ecom",
      platformCountry: "KZ",
      platformAddress: "Алматы",
      participantTaxNumber: "123456789012",
      participantName: "Demo",
      participantCountry: "KZ",
      participantAddress: "Астана",
    };
    try {
      const res = await api.post<{ id: string }>("/products/cards", {
        gtin: form.gtin,
        attributes: attrs,
      });
      if (res.id) toast.push(`Карточка создана (${res.id.slice(0, 8)}…)`);
      setShowCreate(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      if (e instanceof ApiErrorResponse) {
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
      } else if (e instanceof ApiUnavailable) {
        toast.push("Сервис недоступен", "error");
      }
    }
  }

  // черновик: fix-tnved / out-of-scope / создать карточку
  async function fixTnved(id: string) {
    try {
      await api.post(`/products/drafts/${id}/fix-tnved`, {
        tnved: "2710198200",
      });
      toast.push("ТНВЭД исправлен на 2710198200");
      load();
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
    }
  }
  async function outOfScope(id: string) {
    try {
      await api.post(`/products/drafts/${id}/out-of-scope`, {});
      toast.push("Строка вне перечня (подтверждено)");
      load();
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
    }
  }

  const filtered = cards.filter((c) => {
    const matchQ =
      !q ||
      `${c.name ?? ""} ${c.gtin ?? ""}`.toLowerCase().includes(q.toLowerCase());
    const matchS = !statusFilter || c.status === statusFilter;
    return matchQ && matchS;
  });

  const statuses = [...new Set(cards.map((c) => c.status))];

  const cardColumns: Column<CardRow>[] = [
    {
      key: "name",
      label: "Товар",
      render: (r) => (
        <a onClick={() => nav(`/productDetail/${r.id}`)}>{r.name ?? r.gtin}</a>
      ),
    },
    {
      key: "gtin",
      label: "GTIN / НТИН",
      render: (r) => `${r.gtin ?? "—"} / ${r.ntin ?? "—"}`,
    },
    {
      key: "status",
      label: "Статус",
      render: (r) => (
        <span className={`badge ${STATUS_BADGE[r.status] ?? "b-gray"}`}>
          {r.status}
        </span>
      ),
    },
    {
      key: "updatedAt",
      label: "Обновлено",
      render: (r) => new Date(r.updatedAt).toLocaleDateString(),
    },
  ];

  const draftColumns: Column<DraftRow>[] = [
    {
      key: "name",
      label: "Наименование",
      render: (r) => r.proposed.name ?? "—",
    },
    {
      key: "tnved",
      label: "ТНВЭД",
      render: (r) => {
        const tnved = r.proposed.tnved ?? "";
        const inList = IN_LIST.includes(tnved);
        return (
          <span style={{ color: inList ? "var(--green)" : "var(--red)" }}>
            {tnved || "—"}
            {!inList && tnved && (
              <em> · {r.proposed.tnvedHint ?? "вне перечня"}</em>
            )}
          </span>
        );
      },
    },
    { key: "status", label: "Статус", render: (r) => r.status },
    {
      key: "actions",
      label: "Действия",
      render: (r) => (
        <>
          <button
            className="btn btn-soft btn-sm"
            onClick={() => fixTnved(r.id)}
          >
            Исправить код
          </button>{" "}
          <button
            className="btn btn-light btn-sm"
            onClick={() => outOfScope(r.id)}
          >
            Вне перечня
          </button>{" "}
          <button
            className="btn btn-light btn-sm"
            onClick={() => nav(`/productDetail/new?draft=${r.id}`)}
          >
            Создать карточку
          </button>
        </>
      ),
    },
  ];

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Каталог товаров</h1>
          <div className="sub">
            Карточки, GTIN/НТИН, упаковочные уровни, модерация
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-light" onClick={downloadTemplate}>
            ⇩ Шаблон импорта
          </button>
          <button
            className="btn btn-light"
            onClick={() => setShowImport(!showImport)}
          >
            ⇧ Импорт
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreate(!showCreate)}
          >
            + Создать товар
          </button>
        </div>
      </div>

      {showImport && (
        <div className="card" style={{ marginBottom: 15 }}>
          <div className="card-title">Импорт черновиков (JSON rows)</div>
          <textarea
            className="input"
            rows={6}
            value={jsonRows}
            onChange={(e) => setJsonRows(e.target.value)}
            placeholder='[{"name":"Масло X","gtin":"04014835723399","tnved":"2710198200"}]'
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" onClick={importRows}>
              Импортировать
            </button>
            <button className="btn btn-light" onClick={seedInvoice}>
              Загрузить инвойс (демо)
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="card" style={{ marginBottom: 15 }}>
          <div className="card-title">Создание товарной карточки</div>
          <div className="wizard">
            <div className="wizard-step active">
              <span>1</span>Основное
            </div>
            <div className="wizard-line" />
            <div className="wizard-step">
              <span>2</span>Атрибуты
            </div>
            <div className="wizard-line" />
            <div className="wizard-step">
              <span>3</span>Упаковки
            </div>
            <div className="wizard-line" />
            <div className="wizard-step">
              <span>4</span>Проверка
            </div>
          </div>
          <div className="form-grid">
            <div className="field full">
              <label>Полное наименование *</label>
              <input
                className="input"
                placeholder="Полное наименование"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>GTIN *</label>
              <input
                className="input"
                placeholder="GTIN"
                value={form.gtin}
                onChange={(e) => setForm({ ...form, gtin: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Бренд</label>
              <input
                className="input"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </div>
            <div className="field">
              <label>ТН ВЭД</label>
              <input
                className="input"
                value={form.tnved}
                onChange={(e) => setForm({ ...form, tnved: e.target.value })}
              />
            </div>
            <div className="field">
              <label>SAE</label>
              <input
                className="input"
                value={form.sae}
                onChange={(e) => setForm({ ...form, sae: e.target.value })}
              />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 14,
            }}
          >
            <button
              className="btn btn-light"
              onClick={() => setShowCreate(false)}
            >
              Отмена
            </button>
            <button
              className="btn btn-primary"
              onClick={createCard}
              disabled={!form.name || !form.gtin}
            >
              Создать карточку
            </button>
          </div>
        </div>
      )}

      <div className="tabs">
        <button
          className={`tab ${tab === "cards" ? "active" : ""}`}
          onClick={() => setTab("cards")}
        >
          Карточки ({cards.length})
        </button>
        <button
          className={`tab ${tab === "drafts" ? "active" : ""}`}
          onClick={() => setTab("drafts")}
        >
          Черновики (добор) ({drafts.length})
        </button>
      </div>

      {tab === "cards" && (
        <div className="card">
          <div className="toolbar">
            <input
              className="input search"
              placeholder="Поиск по наименованию, GTIN…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Все статусы</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              className="btn btn-light"
              onClick={() => toast.push("Настройка колонок — эволюция", "warn")}
            >
              ⚙ Колонки
            </button>
            <button
              className="btn btn-light"
              onClick={() => toast.push("Вид сохранён")}
            >
              Сохранить вид
            </button>
          </div>
          <EntityList
            columns={cardColumns}
            rows={filtered}
            rowKey={(r) => r.id}
            bulkSelect
            emptyText="Нет карточек"
          />
        </div>
      )}

      {tab === "drafts" && (
        <div className="card">
          <EntityList
            columns={draftColumns}
            rows={drafts}
            rowKey={(r) => r.id}
            emptyText="Нет черновиков"
          />
        </div>
      )}
    </section>
  );
}
