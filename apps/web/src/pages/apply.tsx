import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { useToast } from "../toast";

const FIELDS = [
  { name: "name", label: "Наименование организации" },
  { name: "bin", label: "БИН" },
  { name: "email", label: "Email" },
  { name: "phone", label: "Телефон" },
  { name: "city", label: "Город" },
  { name: "address", label: "Адрес" },
  { name: "contact", label: "Контактное лицо" },
] as const;

const OFFER_VERSION = "v1";

export function ApplyPage() {
  const toast = useToast();
  const [params] = useSearchParams();
  const correctionId = params.get("correction");
  const [form, setForm] = useState<Record<string, string>>({});
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  // после любого ответа (новый или дубль) повторный POST не отправляем
  const [done, setDone] = useState(false);

  const set = (name: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [name]: e.target.value }));

  async function submit() {
    if (!agree) {
      toast.push("Необходимо согласие с офертой");
      return;
    }
    setSubmitting(true);
    try {
      const { status, body } = await api.postRaw<{
        id: string;
        status: string;
      }>("/onboarding/applications", {
        ...form,
        offerVersion: OFFER_VERSION,
      });
      setCreatedId(body.id);
      setDone(true);
      if (status === 200) {
        // дубль БИН (AT-02): существующая заявка, повторный POST не отправляем
        toast.push(`Заявка уже существует. Статус: ${body.status}`);
      } else {
        toast.push(`Заявка отправлена. Статус: ${body.status}`);
      }
    } catch (e) {
      if (e instanceof ApiErrorResponse) {
        toast.push(`${e.error.code}: ${e.error.message}`);
      } else if (e instanceof ApiUnavailable) {
        toast.push("Сервис недоступен. Попробуйте позже.");
      } else {
        toast.push("Ошибка отправки");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h1>Заявка на подключение</h1>
      {correctionId && <p>Исправление заявки #{correctionId}</p>}
      {FIELDS.map((f) => (
        <label key={f.name}>
          {f.label}
          <input
            name={f.name}
            value={form[f.name] ?? ""}
            onChange={set(f.name)}
          />
        </label>
      ))}
      <label>
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
        />
        Согласен с офертой ({OFFER_VERSION})
      </label>
      <button onClick={submit} disabled={submitting || done}>
        Отправить заявку
      </button>
      {done && <p>Заявка обработана — повторная отправка недоступна.</p>}
      {createdId && (
        <p>
          Проверить статус:{" "}
          <Link to={`/status?id=${createdId}`}>по номеру {createdId}</Link>
        </p>
      )}
      <p>
        Уже подали заявку? <Link to="/status">Проверить статус</Link>
      </p>
    </section>
  );
}
