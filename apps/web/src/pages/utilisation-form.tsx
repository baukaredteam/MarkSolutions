import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { useToast } from "../toast";
import "./utilisation-form.css";

const RELEASE_TYPES = ["PRODUCTION", "IMPORT", "CIRCULATION"] as const;
const STEPS = ["Заказ", "Поля", "Подтверждение", "Статус"] as const;

interface OrderOption {
  id: string;
  number?: number;
  gtin: string | null;
  status: string;
}

interface UtilisationResult {
  reportId: string;
  status: string;
  rejectReason?: string;
}

function fmtOrderNumber(n: number | undefined): string {
  return `KM-2026-${String(n ?? 0).padStart(6, "0")}`;
}

function orderLabel(o: OrderOption): string {
  return `${fmtOrderNumber(o.number)} · ${o.gtin ?? "—"} · ${o.status}`;
}

// Форма «Отчёт о нанесении» (W3, п.26 / OPS-04): мастер заказ→поля→подтверждение→
// статус. POST /utilisation; поллинг — повторный POST с тем же Idempotency-Key.
export function UtilisationForm({ onSettled }: { onSettled?: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [orderId, setOrderId] = useState("");
  const [releaseType, setReleaseType] = useState<string>("PRODUCTION");
  const [expirationDate, setExpirationDate] = useState("");
  const [productionDate, setProductionDate] = useState("");
  const [manufacturerCountry, setManufacturerCountry] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UtilisationResult | null>(null);

  useEffect(() => {
    api
      .get<{ items: OrderOption[] }>("/orders")
      .then((o) => setOrders(o.items ?? []))
      .catch((e) => {
        setOrders([]);
        if (e instanceof ApiErrorResponse)
          toast.push(`${e.error.code}: ${e.error.message}`);
        else if (e instanceof ApiUnavailable)
          toast.push("Сервис недоступен. Попробуйте позже.");
      });
  }, []);

  const selected = orders.find((o) => o.id === orderId);
  const country = manufacturerCountry.trim().toUpperCase();

  function submit(utilKey: string): Promise<UtilisationResult> {
    return api
      .postRaw<UtilisationResult>(
        "/utilisation",
        {
          orderId: orderId.trim(),
          releaseType,
          expirationDate,
          productionDate,
          manufacturerCountry: country,
        },
        utilKey
      )
      .then((r) => r.body);
  }

  function next() {
    if (step === 0 && !orderId.trim()) {
      toast.push("Выберите заказ из списка");
      return;
    }
    if (
      step === 1 &&
      (!expirationDate || !productionDate || !manufacturerCountry.trim())
    ) {
      toast.push(
        "Заполните orderId, даты (expiration/production) и страну (ISO2)"
      );
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
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
    setStep(3);
    const key = crypto.randomUUID();
    try {
      let body = await submit(key);
      setResult(body);
      // поллинг: идемпотентный POST с тем же ключом возвращает актуальный status
      for (
        let i = 0;
        i < 40 && body.status !== "SUCCESS" && body.status !== "ERROR";
        i++
      ) {
        await new Promise((r) => setTimeout(r, 250));
        body = await submit(key);
        setResult(body);
      }
      if (body.status === "SUCCESS") {
        toast.push("Нанесение зарегистрировано, коды списаны");
        if (onSettled) onSettled();
      } else if (body.status === "ERROR") {
        const reason =
          body.rejectReason ??
          (await submit(key).catch(() => null))?.rejectReason ??
          "ошибка";
        setResult({ ...body, rejectReason: reason });
        toast.push(`Нанесение отклонено: ${reason}`);
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
    <fieldset className="utilisation-wizard">
      <legend>Отчёт о нанесении</legend>
      <div className="wizard" aria-label="Шаги мастера">
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: "contents" }}>
            <div
              className={`wizard-step${i === step ? " active" : ""}${i < step ? " done" : ""}`}
            >
              <span>{i + 1}</span>
              {s}
            </div>
            {i < STEPS.length - 1 && <div className="wizard-line" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div>
          <div className="field">
            <label htmlFor="util-order">Заказ</label>
            <select
              id="util-order"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
            >
              <option value="">— выберите заказ —</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {orderLabel(o)}
                </option>
              ))}
            </select>
          </div>
          <p className="hint">
            {selected
              ? `Выбран: ${orderLabel(selected)}`
              : "Список заказов из GET /orders. Нанесение — для COMPLETED / PARTIALLY_COMPLETED."}
          </p>
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="util-release">Тип выпуска</label>
              <select
                id="util-release"
                value={releaseType}
                onChange={(e) => setReleaseType(e.target.value)}
              >
                {RELEASE_TYPES.map((rt) => (
                  <option key={rt} value={rt}>
                    {rt}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="util-country">Страна (ISO2)</label>
              <input
                id="util-country"
                className="input"
                placeholder="Страна (ISO2)"
                value={manufacturerCountry}
                onChange={(e) => setManufacturerCountry(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="util-exp">Дата окончания</label>
              <input
                id="util-exp"
                className="input"
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="util-prod">Дата производства</label>
              <input
                id="util-prod"
                className="input"
                type="date"
                value={productionDate}
                onChange={(e) => setProductionDate(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="utilisation-review">
          <p>
            Заказ: <strong>{selected ? orderLabel(selected) : orderId}</strong>
          </p>
          <p>
            Тип выпуска: <strong>{releaseType}</strong>
          </p>
          <p>
            Дата окончания: <strong>{expirationDate}</strong>
          </p>
          <p>
            Дата производства: <strong>{productionDate}</strong>
          </p>
          <p>
            Страна: <strong>{country}</strong>
          </p>
          <p className="hint">
            Отправка в существующий mock POST /utilisation. Повтор с тем же
            Idempotency-Key вернёт статус, не новый вызов ИС МПТ.
          </p>
          <button className="btn btn-primary" onClick={run} disabled={loading}>
            Зарегистрировать нанесение
          </button>
        </div>
      )}

      {step === 3 && (
        <div
          className={`utilisation-status${
            result?.status === "SUCCESS"
              ? " ok"
              : result?.status === "ERROR"
                ? " err"
                : ""
          }`}
        >
          {loading && !result && <p>Отправка отчёта…</p>}
          {result && (
            <>
              <p>
                Статус: <strong>{result.status}</strong>
              </p>
              {result.reportId && (
                <p className="hint">reportId: {result.reportId}</p>
              )}
              {result.status === "SUCCESS" && (
                <p>Нанесение зарегистрировано, коды списаны</p>
              )}
              {result.status === "ERROR" && (
                <p>Нанесение отклонено: {result.rejectReason ?? "ошибка"}</p>
              )}
              {result.status !== "SUCCESS" &&
                result.status !== "ERROR" &&
                !loading && <p>Статус не определён — проверьте позже</p>}
            </>
          )}
        </div>
      )}

      {step < 2 && (
        <div className="utilisation-nav">
          {step > 0 && (
            <button
              className="btn btn-light"
              type="button"
              onClick={() => setStep((s) => s - 1)}
            >
              Назад
            </button>
          )}
          <button className="btn btn-blue" type="button" onClick={next}>
            Далее
          </button>
        </div>
      )}
      {step === 2 && (
        <div className="utilisation-nav">
          <button
            className="btn btn-light"
            type="button"
            onClick={() => setStep(1)}
          >
            Назад
          </button>
        </div>
      )}
    </fieldset>
  );
}

// Тонкая страница-обёртка: существующая форма в 16-module shell, без новых STAGE-вызовов.
export function UtilisationFormPage() {
  const nav = useNavigate();
  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Отчёт о нанесении</h1>
          <div className="sub">
            Сведения о нанесении кодов. Повторный POST с тем же ключом — статус,
            не новый вызов ИС МПТ.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-light" onClick={() => nav("/operations")}>
            К журналу
          </button>
        </div>
      </div>
      <div className="card">
        <UtilisationForm />
      </div>
    </section>
  );
}
