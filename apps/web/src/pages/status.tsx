import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { useToast } from "../toast";

type AppStatus = "PENDING" | "NEEDS_CORRECTION" | "APPROVED" | "REJECTED";

interface Application {
  id: string;
  status: AppStatus;
  timeline: { at: string; event: string }[];
}

const STATUS_LABEL: Record<AppStatus, string> = {
  PENDING: "На рассмотрении",
  NEEDS_CORRECTION: "Требует исправления",
  APPROVED: "Одобрена",
  REJECTED: "Отклонена",
};

export function StatusPage() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [id, setId] = useState(params.get("id") ?? "");
  const [app, setApp] = useState<Application | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!id.trim()) {
      toast.push("Введите номер заявки или БИН");
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<Application>(
        `/onboarding/applications/${encodeURIComponent(id.trim())}`
      );
      setApp(res);
    } catch (e) {
      if (e instanceof ApiErrorResponse) {
        toast.push(`${e.error.code}: ${e.error.message}`);
      } else if (e instanceof ApiUnavailable) {
        toast.push("Сервис недоступен. Попробуйте позже.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h1>Статус заявки</h1>
      <input
        placeholder="Номер заявки или БИН"
        value={id}
        onChange={(e) => setId(e.target.value)}
      />
      <button onClick={load} disabled={loading}>
        Показать статус
      </button>
      {app && (
        <>
          <p>
            Статус: <strong>{STATUS_LABEL[app.status]}</strong>
          </p>
          {app.timeline.map((t, i) => (
            <p key={i}>
              {t.at}: {t.event}
            </p>
          ))}
          {app.status === "NEEDS_CORRECTION" && (
            <Link to={`/apply?correction=${app.id}`}>Исправить</Link>
          )}
          {app.status === "APPROVED" && (
            <Link to="/login">Перейти ко входу</Link>
          )}
        </>
      )}
    </section>
  );
}
