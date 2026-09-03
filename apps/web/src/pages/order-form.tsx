import { useEffect, useState } from "react";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { formatTenge } from "../money";
import { useToast } from "../toast";

interface Tariff {
  id: string;
  pricePerCodeKZT: string;
}

interface CardOption {
  id: string;
  gtin: string;
  name: string;
  status: string;
}

const STEPS = ["Товар", "Параметры", "Финансы", "Подтверждение"] as const;

// Мастер «Новый заказ кодов» (UI-SPEC §4.6, §5): Товары → Параметры → Финансы →
// Подтверждение. Превью «места × штук = quantity», тариф из activeTariff, остаток
// после списания = available − totalPrice, Idempotency-Key (crypto.randomUUID).
export function OrderForm({ onCreated }: { onCreated?: (id: string) => void }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [cards, setCards] = useState<CardOption[]>([]);
  const [cardId, setCardId] = useState("");
  const [gtin, setGtin] = useState("");
  const [places, setPlaces] = useState("");
  const [unitsPerPlace, setUnitsPerPlace] = useState("");
  const [quantity, setQuantity] = useState("");
  const [businessPlaceId, setBusinessPlaceId] = useState("");
  const productGroup = "autofluids";
  const [tariff, setTariff] = useState<Tariff | null>(null);
  const [balance, setBalance] = useState<{ available: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [idemKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    api
      .get<{ items: CardOption[] }>("/products/cards")
      .then((c) => setCards(c.items ?? []))
      .catch(() => {});
    api
      .get<{ id: string; pricePerCodeKZT: string }>("/billing/tariff/active")
      .then((t) => setTariff({ id: t.id, pricePerCodeKZT: t.pricePerCodeKZT }))
      .catch(() => {});
    api
      .get<{ available: string }>("/billing/balance")
      .then((b) => setBalance(b))
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
  const available = balance ? BigInt(balance.available) : BigInt(0);
  const afterSettle = available - totalPrice;

  const gtin14 = /^\d{14}$/.test(gtin.trim());
  const stepValid = (() => {
    if (step === 0) return cardId.trim() !== "" && gtin14;
    if (step === 1) return placesNum >= 1 && unitsNum >= 1 && qtyValid;
    if (step === 2) return tariff !== null;
    return true;
  })();

  function next() {
    if (!stepValid) {
      if (step === 0) {
        toast.push(
          gtin.trim() && !gtin14
            ? "Длина должна быть равна 14"
            : "Выберите карточку товара"
        );
      } else if (step === 1)
        toast.push("Заполните места/штук (quantity 1..места×штук)");
      else if (step === 2) toast.push("Тариф не загружен");
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function submit() {
    setLoading(true);
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
          productGroup,
          ...(businessPlaceId.trim()
            ? { businessPlaceId: Number(businessPlaceId) }
            : {}),
        },
        idemKey
      );
      toast.push(`Заказ создан: ${res.body.id}`);
      if (onCreated) onCreated(res.body.id);
      setStep(0);
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

  const selectedCard = cards.find((c) => c.id === cardId);

  return (
    <fieldset>
      <legend>Новый заказ кодов</legend>
      <div className="wizard-step">
        {STEPS.map((s, i) => (
          <span
            key={s}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <span
              style={{
                width: 27,
                height: 27,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                background:
                  i === step ? "var(--blue)" : i < step ? "#dff3e8" : "#edf1f5",
                color: i <= step ? "#fff" : "var(--muted)",
                fontWeight: 750,
              }}
            >
              {i + 1}
            </span>
            <span
              style={{
                width: "auto",
                height: "auto",
                background: "transparent",
                fontWeight: 750,
              }}
            >
              {s}
            </span>
            {i < STEPS.length - 1 && <span className="wizard-line" />}
          </span>
        ))}
      </div>

      {step === 0 && (
        <div>
          <label>
            Товар (карточка):
            <select
              value={cardId}
              onChange={(e) => {
                const c = cards.find((x) => x.id === e.target.value);
                setCardId(e.target.value);
                setGtin(c?.gtin ?? "");
              }}
            >
              <option value="">— выберите карточку —</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.gtin} ({c.gtin})
                </option>
              ))}
            </select>
          </label>
          <p className="hint">
            {selectedCard
              ? `Карточка: ${selectedCard.name || "—"} · GTIN ${selectedCard.gtin} · ${selectedCard.status}`
              : "Карточки товара из каталога (Registered/Approved)"}
          </p>
          <input
            placeholder="GTIN-14"
            value={gtin}
            readOnly
            maxLength={14}
            inputMode="numeric"
            style={{ opacity: 0.6 }}
          />
          {gtin && !gtin14 && (
            <p className="hint" role="alert">
              Длина должна быть равна 14
            </p>
          )}
          <p className="hint">
            Товарная группа STAGE: <code>{productGroup}</code> (autofluids, не
            motor-oils)
          </p>
          <label>
            МОД (businessPlaceId):
            <input
              type="number"
              placeholder="МОД (businessPlaceId)"
              value={businessPlaceId}
              onChange={(e) => setBusinessPlaceId(e.target.value)}
              min={1}
            />
          </label>
          <p className="hint">
            Площадка нанесения из заказа. Дефолт env: MPT_BUSINESS_PLACE_ID=803
            (не хардкод в адаптере).
          </p>
        </div>
      )}

      {step === 1 && (
        <div>
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
          <p className="hint">
            Серийный номер: эмитирует оператор (SELF_MADE недоступен) ·
            Маркировка: единица (UNIT)
          </p>
        </div>
      )}

      {step === 2 && (
        <div>
          {tariff && (
            <p>
              Тариф: {formatTenge(pricePerCode)}/КМ · quantity: {qtyNum}
            </p>
          )}
          <p>
            Сумма к списанию: <strong>{formatTenge(totalPrice)}</strong>
          </p>
          <p>
            Доступно: {formatTenge(available)} · Остаток после списания:{" "}
            <strong>
              {formatTenge(afterSettle)}
              {afterSettle < BigInt(0) ? " (недостаточно средств)" : ""}
            </strong>
          </p>
        </div>
      )}

      {step === 3 && (
        <div>
          <p>
            Заказ: {selectedCard?.name || gtin} · {qtyNum} КМ ·{" "}
            {formatTenge(totalPrice)}
          </p>
          <p className="hint">
            ТГ {productGroup}
            {businessPlaceId.trim()
              ? ` · МОД ${businessPlaceId.trim()}`
              : " · МОД из tenant/env"}
          </p>
          <p>
            Idempotency-Key: <code>{idemKey}</code>
          </p>
          <p className="hint">
            Повторная отправка с тем же ключом вернёт существующий заказ (AT-07)
          </p>
          <button onClick={submit} disabled={loading}>
            Заказать коды
          </button>
        </div>
      )}

      {step < 3 && (
        <div style={{ marginTop: 10 }}>
          {step > 0 && (
            <button
              className="btn btn-light"
              onClick={() => setStep((s) => s - 1)}
            >
              Назад
            </button>
          )}{" "}
          <button onClick={next}>Далее</button>
        </div>
      )}
    </fieldset>
  );
}
