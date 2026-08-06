import { useState } from "react";
import invoiceFixture from "../../../../fixtures/invoice-38.json";
import { useToast } from "../toast";
import { sessionStore } from "../session";

interface InvoiceRow {
  name: string;
  tnved: string;
  qty?: number;
  priceUsd?: number;
  demo?: boolean;
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
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [chip, setChip] = useState<Chip>("all");

  function loadInvoice() {
    if (!sessionStore.get()) {
      // AT-16 в UI: без сессии → ошибка tenant_id required (400)
      toast.push("400: tenant_id required");
      return;
    }
    setRows(invoiceFixture);
  }

  const filtered = rows.filter((r) => {
    if (chip === "out") return !IN_LIST.includes(r.tnved);
    if (chip === "in") return IN_LIST.includes(r.tnved);
    return true;
  });

  return (
    <section>
      <h1>Товары</h1>
      <button onClick={loadInvoice}>Загрузить инвойс (демо)</button>
      <button onClick={() => setChip("all")}>Все</button>
      <button onClick={() => setChip("out")}>Вне перечня</button>
      <button onClick={() => setChip("in")}>Из перечня</button>
      <table>
        <thead>
          <tr>
            <th>Наименование</th>
            <th>ТНВЭД</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r, i) => {
            const inList = IN_LIST.includes(r.tnved);
            return (
              <tr key={i} style={{ color: inList ? "green" : "red" }}>
                <td>{r.name}</td>
                <td>
                  {r.tnved}
                  {!inList && <em> — {HINT}</em>}
                </td>
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
