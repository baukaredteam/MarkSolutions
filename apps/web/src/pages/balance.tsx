import { useEffect, useState } from "react";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { useToast } from "../toast";
import { EntityList, type Column } from "../entity-list";

interface Balance {
  balance: string;
  reserved: string;
  available: string;
}

// Экран «Баланс» (W3): GET /billing/balance + пополнение POST /billing/payments/import.
// Идемпотентность ref1c: повтор той же проводки → API возвращает 200 existing.
export function BalancePage() {
  const toast = useToast();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [ref1c, setRef1c] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const b = await api.get<Balance>("/billing/balance");
      setBalance(b);
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

  async function topUp() {
    if (!ref1c.trim() || !amount.trim()) {
      toast.push("Укажите ref1c и сумму");
      return;
    }
    setLoading(true);
    try {
      const { status } = await api.postRaw<{ id: string }>(
        "/billing/payments/import",
        {
          ref1c: ref1c.trim(),
          amount: amount.trim(),
          reason: "пополнение из 1С",
        }
      );
      if (status === 200) {
        toast.push("Проводка уже существует (идемпотентно по ref1c)");
      } else {
        toast.push("Баланс пополнен");
      }
      setRef1c("");
      setAmount("");
      await load();
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`);
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  }

  const rows: Balance[] = balance ? [balance] : [];
  const columns: Column<Balance>[] = [
    {
      key: "balance",
      label: "Баланс",
      render: (r) => <strong>{r.balance} ₸</strong>,
    },
    { key: "reserved", label: "Зарезервировано" },
    { key: "available", label: "Доступно" },
  ];

  return (
    <section>
      <h1>Баланс</h1>
      <button onClick={load} disabled={loading}>
        Обновить
      </button>
      <EntityList columns={columns} rows={rows} rowKey={() => "bal"} />
      <h2>Пополнить (файл «из 1С», MVP — JSON)</h2>
      <input
        placeholder="ref1c"
        value={ref1c}
        onChange={(e) => setRef1c(e.target.value)}
      />
      <input
        placeholder="Сумма (тенге)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <button onClick={topUp} disabled={loading}>
        Пополнить
      </button>
    </section>
  );
}
