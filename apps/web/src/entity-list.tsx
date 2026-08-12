import { useMemo, useState, type ReactNode } from "react";

// ADR-008 + UI-SPEC §2: data-driven таблицы (EntityList v2).
// hover-строки, sticky th, пагинация «1–8 из N», bulk-select, empty-state.
export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
}

interface EntityListProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  pageSize?: number;
  bulkSelect?: boolean;
  emptyText?: string;
}

export function EntityList<T>({
  columns,
  rows,
  rowKey,
  pageSize = 8,
  bulkSelect = false,
  emptyText = "Нет данных",
}: EntityListProps<T>) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize]
  );

  if (rows.length === 0) {
    return <div className="empty">{emptyText}</div>;
  }

  function toggleAll(checked: boolean) {
    const next = new Set<string>();
    if (checked) for (const r of pageRows) next.add(rowKey(r));
    setSelected(next);
  }
  function toggleOne(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const from = (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, rows.length);

  return (
    <div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {bulkSelect && (
                <th style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    checked={
                      pageRows.length > 0 &&
                      pageRows.every((r) => selected.has(rowKey(r)))
                    }
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="Выбрать все на странице"
                  />
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const key = rowKey(row);
              return (
                <tr key={key}>
                  {bulkSelect && (
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggleOne(key)}
                        aria-label="Выбрать строку"
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key}>
                      {c.render
                        ? c.render(row)
                        : String((row as Record<string, unknown>)[c.key] ?? "")}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="pagination">
          <span>
            Показано {from}–{to} из {rows.length}
          </span>
          <div className="pages">
            <button
              className="btn btn-light btn-sm"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              ‹
            </button>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                className={`btn btn-sm ${p === safePage ? "btn-primary" : "btn-light"}`}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ))}
            <button
              className="btn btn-light btn-sm"
              disabled={safePage >= pageCount}
              onClick={() => setPage(safePage + 1)}
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
