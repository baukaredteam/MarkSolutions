import { useState } from "react";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { useToast } from "../toast";

const RELEASE_TYPES = ["PRODUCTION", "IMPORT", "CIRCULATION"] as const;

// Форма «Отчёт о нанесении» (W3, п.26): POST /utilisation; поллинг статуса —
// повторный POST с тем же Idempotency-Key возвращает актуальный status (SUCCESS/ERROR).
export function UtilisationForm({ onSettled }: { onSettled?: () => void }) {
  const toast = useToast();
  const [orderId, setOrderId] = useState("");
  const [releaseType, setReleaseType] = useState<string>("PRODUCTION");
  const [expirationDate, setExpirationDate] = useState("");
  const [productionDate, setProductionDate] = useState("");
  const [manufacturerCountry, setManufacturerCountry] = useState("");
  const [loading, setLoading] = useState(false);

  function submit(utilKey: string): Promise<string> {
    return api
      .postRaw<{ reportId: string; status: string }>(
        "/utilisation",
        {
          orderId: orderId.trim(),
          releaseType,
          expirationDate,
          productionDate,
          manufacturerCountry: manufacturerCountry.trim().toUpperCase(),
        },
        utilKey
      )
      .then((r) => r.body.status);
  }

  async function run() {
    if (
      !orderId.trim() ||
      !expirationDate ||
      !productionDate ||
      !manufacturerCountry.trim()
    ) {
      toast.push(
        "Заполните orderId, даты (expiration/production) и страну (ISO2)"
      );
      return;
    }
    setLoading(true);
    const key = crypto.randomUUID();
    try {
      let status = await submit(key);
      // поллинг: идемпотентный POST с тем же ключом возвращает актуальный status
      for (
        let i = 0;
        i < 40 && status !== "SUCCESS" && status !== "ERROR";
        i++
      ) {
        await new Promise((r) => setTimeout(r, 250));
        status = await submit(key);
      }
      if (status === "SUCCESS") {
        toast.push("Нанесение зарегистрировано, коды списаны");
        if (onSettled) onSettled();
      } else if (status === "ERROR") {
        // повторный submit вернул ERROR → берём rejectReason из последнего ответа
        const err = await api
          .postRaw<{ rejectReason?: string }>(
            "/utilisation",
            {
              orderId: orderId.trim(),
              releaseType,
              expirationDate,
              productionDate,
              manufacturerCountry: manufacturerCountry.trim().toUpperCase(),
            },
            key
          )
          .catch(() => null);
        toast.push(
          `Нанесение отклонено: ${err?.body?.rejectReason ?? "ошибка"}`
        );
      } else {
        toast.push("Статус не определён — проверьте позже");
      }
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`);
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <fieldset>
      <legend>Отчёт о нанесении</legend>
      <input
        placeholder="orderId"
        value={orderId}
        onChange={(e) => setOrderId(e.target.value)}
      />
      <select
        value={releaseType}
        onChange={(e) => setReleaseType(e.target.value)}
      >
        {RELEASE_TYPES.map((rt) => (
          <option key={rt} value={rt}>
            {rt}
          </option>
        ))}
      </select>
      <input
        type="date"
        placeholder="Дата окончания"
        value={expirationDate}
        onChange={(e) => setExpirationDate(e.target.value)}
      />
      <input
        type="date"
        placeholder="Дата производства"
        value={productionDate}
        onChange={(e) => setProductionDate(e.target.value)}
      />
      <input
        placeholder="Страна (ISO2)"
        value={manufacturerCountry}
        onChange={(e) => setManufacturerCountry(e.target.value)}
      />
      <button onClick={run} disabled={loading}>
        Зарегистрировать нанесение
      </button>
    </fieldset>
  );
}
