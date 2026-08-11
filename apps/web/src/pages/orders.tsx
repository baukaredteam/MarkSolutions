import { useEffect, useState } from "react";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { useToast } from "../toast";
import { EntityList, type Column } from "../entity-list";
import { OrderForm } from "./order-form";

interface OrderRow {
  id: string;
  gtin: string | null;
  quantity: number;
  totalPrice: string;
  status: string;
  createdAt: string;
}

interface CodeRow {
  gtin: string;
  mask: string;
  quantity: number;
  status: string;
  orderId: string;
}

// Экран «Заказы» (W3): GET /orders + детали с масками КМ (GET /api/codes),
// кнопка «Скачать коды» (POST /codes/export CSV + аудит), форма создания заказа.
export function OrdersPage() {
  const toast = useToast();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const o = await api.get<{ items: OrderRow[] }>("/orders");
      setOrders(o.items);
      const c = await api
        .get<{ items: CodeRow[] }>("/api/codes")
        .catch(() => ({ items: [] }));
      setCodes(c.items);
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
        // скачивание CSV (BOM + «;»)
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

  const canDownload = (status: string) =>
    status === "COMPLETED" || status === "PARTIALLY_COMPLETED";

  const columns: Column<OrderRow>[] = [
    { key: "id", label: "ID" },
    { key: "gtin", label: "GTIN" },
    { key: "quantity", label: "Кол-во" },
    { key: "totalPrice", label: "Сумма" },
    { key: "status", label: "Статус" },
    { key: "createdAt", label: "Создан" },
    {
      key: "actions",
      label: "Действия",
      render: (r) => (
        <>
          <button onClick={() => setSelected(selected === r.id ? null : r.id)}>
            {selected === r.id ? "Скрыть" : "Коды"}
          </button>{" "}
          {canDownload(r.status) && (
            <button onClick={() => downloadCodes(r.id)}>Скачать коды</button>
          )}
        </>
      ),
    },
  ];

  return (
    <section>
      <h1>Заказы кодов</h1>
      <button onClick={load} disabled={loading}>
        Обновить
      </button>
      <EntityList columns={columns} rows={orders} rowKey={(r) => r.id} />
      {selected && (
        <section>
          <h2>Коды заказа (маски, без полных serial)</h2>
          <EntityList
            columns={[
              { key: "gtin", label: "GTIN" },
              { key: "mask", label: "Маска КМ" },
              { key: "quantity", label: "Кол-во" },
              { key: "status", label: "Статус" },
            ]}
            rows={codes.filter((c) => c.orderId === selected)}
            rowKey={(c) => `${c.orderId}:${c.gtin}:${c.mask}`}
          />
        </section>
      )}
      <OrderForm onCreated={load} />
    </section>
  );
}
