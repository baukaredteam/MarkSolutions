import { useEffect, useState } from "react";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { formatTenge } from "../money";
import { useToast } from "../toast";

interface Tariff {
  id: string;
  pricePerCodeKZT: string;
}

// Форма «Создать заказ» (W3): выбор Registered-карточки, превью места×штук=quantity,
// тариф+totalPrice, Idempotency-Key = crypto.randomUUID(); 402 → тост «недостаточно средств».
export function OrderForm({ onCreated }: { onCreated?: (id: string) => void }) {
  const toast = useToast();
  const [tariff, setTariff] = useState<Tariff | null>(null);
  const [cardId, setCardId] = useState("");
  const [gtin, setGtin] = useState("");
  const [places, setPlaces] = useState("");
  const [unitsPerPlace, setUnitsPerPlace] = useState("");
  const [quantity, setQuantity] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // активный тариф для превью totalPrice
    api
      .get<{ id: string; pricePerCodeKZT: string }>("/billing/tariff/active")
      .then((t) => setTariff({ id: t.id, pricePerCodeKZT: t.pricePerCodeKZT }))
      .catch(() => {});
  }, []);

  const placesNum = Number(places || 0);
  const unitsNum = Number(unitsPerPlace || 0);
  const product = placesNum * unitsNum;
  const qtyNum = quantity === "" ? product : Number(quantity);
  const pricePerCode = BigInt(tariff?.pricePerCodeKZT ?? 0);
  const totalPrice = Number.isFinite(qtyNum)
    ? pricePerCode * BigInt(qtyNum)
    : BigInt(0);
  const qtyValid = qtyNum >= 1 && qtyNum <= product;

  async function submit() {
    if (
      !cardId.trim() ||
      !gtin.trim() ||
      !places.trim() ||
      !unitsPerPlace.trim()
    ) {
      toast.push("Заполните карточку, gtin, места и штук");
      return;
    }
    if (!qtyValid) {
      toast.push(`quantity должно быть 1..${product} (места × штук)`);
      return;
    }
    setLoading(true);
    const key = crypto.randomUUID();
    try {
      const res = await api.postRaw<{ id: string }>(
        "/orders",
        {
          cardId: cardId.trim(),
          gtin: gtin.trim(),
          places: placesNum,
          unitsPerPlace: unitsNum,
          quantity: qtyNum,
          cisType: "UNIT",
          serialNumberType: "OPERATOR",
        },
        key
      );
      toast.push(`Заказ создан: ${res.body.id}`);
      if (onCreated) onCreated(res.body.id);
    } catch (e) {
      if (e instanceof ApiErrorResponse) {
        if (e.error.code === 402) toast.push("Недостаточно средств");
        else toast.push(`${e.error.code}: ${e.error.message}`);
      } else if (e instanceof ApiUnavailable) {
        toast.push("Сервис недоступен. Попробуйте позже.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <fieldset>
      <legend>Создать заказ</legend>
      <input
        placeholder="cardId"
        value={cardId}
        onChange={(e) => setCardId(e.target.value)}
      />
      <input
        placeholder="GTIN"
        value={gtin}
        onChange={(e) => setGtin(e.target.value)}
      />
      <input
        type="number"
        placeholder="Места"
        value={places}
        onChange={(e) => setPlaces(e.target.value)}
      />
      <input
        type="number"
        placeholder="Штук в месте"
        value={unitsPerPlace}
        onChange={(e) => setUnitsPerPlace(e.target.value)}
      />
      <p>
        Превью: {placesNum} × {unitsNum} = {product}; quantity:{" "}
        <input
          type="number"
          placeholder="quantity"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />{" "}
        {qtyValid ? "✓" : "✗ (1.." + product + ")"}
      </p>
      {tariff && (
        <p>
          Тариф: {formatTenge(BigInt(tariff.pricePerCodeKZT))}/КМ · totalPrice:{" "}
          <strong>{formatTenge(totalPrice)}</strong>
        </p>
      )}
      <p>
        Серийный номер: эмитирует оператор (SELF_MADE недоступен) · Маркировка:
        единица (UNIT)
      </p>
      <button onClick={submit} disabled={loading}>
        Заказать коды
      </button>
    </fieldset>
  );
}
