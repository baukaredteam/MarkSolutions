import type { ReactNode } from "react";

// ADR-008: data-driven таблицы — конфиги колонок, не хардкод-страницы.
export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
}

interface EntityListProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
}

export function EntityList<T>({ columns, rows, rowKey }: EntityListProps<T>) {
  if (rows.length === 0) {
    return <p>Нет данных</p>;
  }
  return (
    <table>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((c) => (
              <td key={c.key}>
                {c.render
                  ? c.render(row)
                  : String((row as Record<string, unknown>)[c.key] ?? "")}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
