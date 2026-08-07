import { useEffect, useState } from "react";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { useToast } from "../toast";
import { sessionStore } from "../session";

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

const IN_LIST: string[] = [
  "2710198200",
  "3403191000",
  "3403199000",
  "3403990000",
];
const HINT = "возможно 2710198200";

type Chip = "all" | "out" | "in";

export function ProductsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [chip, setChip] = useState<Chip>("all");
  const [loading, setLoading] = useState(false);

  // F5: на mount читаем GET /products/drafts (tenant-scoped); 401 → тост (AT-16)
  useEffect(() => {
    loadDrafts();
  }, []);

  async function loadDrafts() {
    if (!sessionStore.get()) {
      toast.push("401: jwt required");
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<{ items: DraftRow[] }>("/products/drafts");
      setRows(res.items);
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`);
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  }

  // F5: «Загрузить инвойс (демо)» → POST /demo/seed-invoice → перечитать drafts
  async function seedInvoice() {
    if (!sessionStore.get()) {
      toast.push("401: jwt required");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ count: number }>("/demo/seed-invoice", {});
      toast.push(`Загружено ${res.count} черновиков`);
      await loadDrafts();
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`);
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = rows.filter((r) => {
    if (chip === "out") return !IN_LIST.includes(r.proposed.tnved ?? "");
    if (chip === "in") return IN_LIST.includes(r.proposed.tnved ?? "");
    return true;
  });

  return (
    <section>
      <h1>Товары</h1>
      <button onClick={seedInvoice} disabled={loading}>
        Загрузить инвойс (демо)
      </button>
      <button onClick={() => setChip("all")}>Все</button>
      <button onClick={() => setChip("out")}>Вне перечня</button>
      <button onClick={() => setChip("in")}>Из перечня</button>
      <table>
        <thead>
          <tr>
            <th>Наименование</th>
            <th>ТНВЭД</th>
            <th>Статус</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => {
            const tnved = r.proposed.tnved ?? "";
            const inList = IN_LIST.includes(tnved);
            return (
              <tr key={r.id} style={{ color: inList ? "green" : "red" }}>
                <td>
                  {r.proposed.name}
                  {r.demo && <strong> [demo]</strong>}
                  {r.proposed.gtinManual && (
                    <em> [GTIN подтверждён вручную]</em>
                  )}
                </td>
                <td>
                  {tnved}
                  {!inList && <em> — {HINT}</em>}
                </td>
                <td>{r.status}</td>
                <td>
                  <button onClick={() => toast.push("Карточка: заглушка")}>
                    Карточка
                  </button>
                  <button
                    onClick={() => toast.push("Создать карточку: заглушка")}
                  >
                    Создать карточку
                  </button>
                  <button onClick={() => toast.push("Скопировать: заглушка")}>
                    Скопировать
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
