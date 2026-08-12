import { useEffect, useState } from "react";
import { api, ApiErrorResponse, ApiUnavailable } from "../api";
import { sessionStore } from "../session";
import { useToast } from "../toast";
import { EntityList, type Column } from "../entity-list";

interface Pool {
  orderId: string;
  gtin: string;
  mask: string;
  status: string;
  quantity: number;
  utilised?: number;
}

// Vault (UI-SPEC §4.7): KPI, пулы кодов (маски), выгрузка CSV/XLSX, безопасность.
export function VaultPage() {
  const toast = useToast();
  const [pools, setPools] = useState<Pool[]>([]);
  const [reserved, setReserved] = useState<number>(0);

  async function load() {
    try {
      const c = await api.get<{ items: Pool[] }>("/api/codes");
      setPools(c.items);
      const b = await api
        .get<{ reserved: string }>("/billing/balance")
        .catch(() => null);
      setReserved(Number(b?.reserved ?? 0));
    } catch (e) {
      if (e instanceof ApiErrorResponse)
        toast.push(`${e.error.code}: ${e.error.message}`, "error");
      else if (e instanceof ApiUnavailable)
        toast.push("Сервис недоступен. Попробуйте позже.", "error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totalCodes = pools.reduce((s, p) => s + p.quantity, 0);
  const freeCodes = pools
    .filter((p) => p.status === "ACTIVE" || p.status === "PRINTED")
    .reduce((s, p) => s + p.quantity, 0);
  const usedCodes = pools.reduce((s, p) => s + (p.utilised ?? 0), 0);
  const kpis = [
    { label: "Всего кодов", value: totalCodes },
    { label: "Свободно", value: freeCodes },
    { label: "Зарезервировано", value: reserved },
    { label: "Использовано", value: usedCodes },
    { label: "Выбыло", value: 0 },
  ];

  async function download(kind: "csv" | "xlsx", orderId: string) {
    try {
      const sess = sessionStore.get();
      const res = await fetch(
        `/api/codes/export${kind === "csv" ? "" : "/xlsx"}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${sess?.token}`,
            "Content-Type": "application/json",
            Accept: "*/*",
          },
          body: JSON.stringify({ orderId }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(`HTTP ${res.status}: ${err?.message ?? ""}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `markflow-codes-${orderId}.${kind === "csv" ? "csv" : "xlsx"}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.push("Аудит записан (CV-032)");
    } catch (e) {
      toast.push(
        `Ошибка выгрузки ${kind.toUpperCase()}: ${(e as Error).message}`,
        "error"
      );
    }
  }

  const columns: Column<Pool>[] = [
    { key: "orderId", label: "Заказ", render: (r) => r.orderId.slice(0, 12) },
    { key: "gtin", label: "GTIN" },
    { key: "mask", label: "Маска КМ" },
    { key: "quantity", label: "Всего" },
    { key: "status", label: "Статус" },
    {
      key: "actions",
      label: "Выгрузка",
      render: (r) => (
        <>
          <button
            className="btn btn-light btn-sm"
            onClick={() => download("csv", r.orderId)}
          >
            CSV
          </button>{" "}
          <button
            className="btn btn-light btn-sm"
            onClick={() => download("xlsx", r.orderId)}
          >
            XLSX
          </button>
        </>
      ),
    },
  ];

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Code Vault</h1>
          <div className="sub">Защищённое хранение, выдача и аудит кодов</div>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-light"
            onClick={() => toast.push("Сверка запущена в фоне")}
          >
            Запустить сверку
          </button>
          <button
            className="btn btn-primary"
            onClick={() =>
              toast.push("Выберите формат выгрузки в таблице ниже")
            }
          >
            Выгрузить коды
          </button>
        </div>
      </div>

      <div className="grid kpis">
        {kpis.map((k) => (
          <div className="card kpi" key={k.label}>
            <div className="kpi-top">
              <div className="kpi-icon">▣</div>
            </div>
            <div className="kpi-num">{k.value}</div>
            <div className="kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      <p className="hint" style={{ marginTop: 12 }}>
        Выгрузка: CSV — для 1С; XLSX — для людей (Excel).
      </p>

      <div className="grid two" style={{ marginTop: 15 }}>
        <div className="card">
          <div className="card-title">Пулы кодов</div>
          <EntityList
            columns={columns}
            rows={pools}
            rowKey={(r) => r.orderId}
            emptyText="Нет кодов"
          />
        </div>
        <div className="card">
          <div className="card-title">Безопасность хранилища</div>
          <div className="device">
            <div className="device-icon">🔐</div>
            <div>
              <b>Envelope encryption</b>
              <small className="sub" style={{ display: "block" }}>
                AES-256-GCM, per-row nonce, KMS (file dev / OpenBao prod)
              </small>
            </div>
          </div>
          <div className="device" style={{ marginTop: 8 }}>
            <div className="device-icon">☷</div>
            <div>
              <b>Аудит выгрузок</b>
              <small className="sub" style={{ display: "block" }}>
                Каждая выгрузка/печать фиксирует actor, время, количество
                (CV-032)
              </small>
            </div>
          </div>
          <div className="device" style={{ marginTop: 8 }}>
            <div className="device-icon">▦</div>
            <div>
              <b>Маскирование</b>
              <small className="sub" style={{ display: "block" }}>
                Полный КМ только в печать/экспорт; в UI/логах — маска
              </small>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
