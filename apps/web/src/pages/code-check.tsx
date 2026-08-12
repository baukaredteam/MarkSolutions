import { useState } from "react";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { StatusBadge } from "../badge";
import { useToast } from "../toast";

interface LookupResult {
  codeKey: string;
  gtin: string;
  serialMask: string;
  status: string;
  productName: string | null;
  owner: string | null;
  history: { at: string; event: string; reasonCode: string | null }[];
}

// Code Check (UI-SPEC §4.3): поиск КМ по codeKey/raw/GTIN + история CodeEvent.
export function CodeCheckPage() {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function check() {
    if (!code.trim()) {
      toast.push("Введите код для проверки", "warn");
      return;
    }
    setLoading(true);
    try {
      const r = await api.post<LookupResult>("/codes/lookup", {
        code: code.trim(),
      });
      setResult(r);
    } catch (e) {
      if (e instanceof ApiErrorResponse) {
        setResult(null);
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
      } else if (e instanceof ApiUnavailable) {
        toast.push("Сервис недоступен. Попробуйте позже.", "error");
      }
    } finally {
      setLoading(false);
    }
  }

  const evLabel: Record<string, string> = {
    PRINTED: "Код напечатан",
    REPRINTED: "Повторная печать",
    APPLIED: "Код нанесён",
    AGGREGATED: "Агрегирован",
    DISAGGREGATED: "Расформирован",
    UTILISED: "В обороте (отчёт)",
    INTRODUCED: "Введён в оборот",
    EXPIRED: "Истёк",
    WITHDRAWN: "Выведен из оборота",
    WRITTEN_OFF: "Списан",
  };

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Информация о коде</h1>
          <div className="sub">
            Проверка статуса, товара и полной истории движения
          </div>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-light"
            onClick={() =>
              toast.push(
                "Камера подключается в будущей итерации (эволюция)",
                "warn"
              )
            }
          >
            📷 Камера
          </button>
          <button
            className="btn btn-primary"
            onClick={check}
            disabled={loading}
          >
            ▶ Проверить
          </button>
        </div>
      </div>
      <div className="grid two">
        <div className="card">
          <div className="toolbar">
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") check();
              }}
              placeholder="Введите Data Matrix, GTIN или серийный номер"
            />
            <button className="btn btn-blue" onClick={check} disabled={loading}>
              Проверить
            </button>
          </div>
          {!result && (
            <div className="scan-area">
              <div>
                <div className="scan-icon">⌗</div>
                <h3>Введите или отсканируйте код</h3>
                <p className="sub">
                  Поддерживаются ручной ввод, USB-сканер, ТСД и камера.
                </p>
              </div>
            </div>
          )}
          {result && (
            <>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <h2 style={{ margin: 0 }}>Код найден</h2>
                <StatusBadge code={result.status} />
              </div>
              <p className="sub">{result.serialMask}</p>
              <div className="info-grid">
                <div className="info-box">
                  <small>Товар</small>
                  <b>{result.productName ?? "—"}</b>
                </div>
                <div className="info-box">
                  <small>GTIN</small>
                  <b>{result.gtin}</b>
                </div>
                <div className="info-box">
                  <small>Владелец</small>
                  <b>{result.owner ?? "—"}</b>
                </div>
                <div className="info-box">
                  <small>Серийный номер</small>
                  <b>{result.serialMask || "—"}</b>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="card">
          <div className="card-title">История жизненного цикла</div>
          {!result ? (
            <p className="sub">—</p>
          ) : result.history.length === 0 ? (
            <p className="sub">Нет событий</p>
          ) : (
            <div className="timeline">
              {result.history.map((h, i) => (
                <div className="event" key={i}>
                  <div className="event-dot" />
                  <div>
                    <p>
                      <b>{evLabel[h.event] ?? h.event}</b>
                      {h.reasonCode && <em> · {h.reasonCode}</em>}
                    </p>
                    <small>{new Date(h.at).toLocaleString()}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
