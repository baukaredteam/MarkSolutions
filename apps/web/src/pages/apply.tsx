import { useState } from "react";
import { Link } from "react-router-dom";
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
  const [form, setForm] = useState<Record<string, string>>({});
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const set = (name: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [name]: e.target.value }));

  async function submit() {
    if (!agree) {
      toast.push("Необходимо согласие с офертой");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ id: string; status: string }>(
        "/onboarding/applications",
        {
          ...form,
          offerVersion: OFFER_VERSION,
        }
      );
      setCreatedId(res.id);
      toast.push(`Заявка отправлена. Статус: ${res.status}`);
    } catch (e) {
      if (e instanceof ApiErrorResponse && e.error.code === 409) {
        // дубль по БИН → показать существующий статус (AT-02)
        toast.push(`Заявка уже существует: ${e.error.message}`);
        setCreatedId(form.bin);
      } else if (e instanceof ApiErrorResponse) {
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
      <button onClick={submit} disabled={submitting}>
        Отправить заявку
      </button>
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
