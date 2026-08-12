import { STATUS_BADGE, statusLabel } from "./status-labels";

// Badge статуса: data-status={code} + русская подпись. Цвет — по коду (STATUS_BADGE).
export function StatusBadge({ code }: { code: string }) {
  return (
    <span className={`badge ${STATUS_BADGE[code] ?? "b-gray"}`} data-status={code}>
      {statusLabel(code)}
    </span>
  );
}
