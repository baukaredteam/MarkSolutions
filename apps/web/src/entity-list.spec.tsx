// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EntityList, type Column } from "./entity-list";

interface Row {
  id: string;
  name: string;
  amount: string;
}

const columns: Column<Row>[] = [
  { key: "id", label: "ID" },
  { key: "name", label: "Имя" },
  {
    key: "amount",
    label: "Сумма",
    render: (r) => <strong>{r.amount} ₸</strong>,
  },
];

describe("EntityList (ADR-008 data-driven)", () => {
  it("renders columns header and rows by config", () => {
    render(
      <EntityList
        columns={columns}
        rows={[
          { id: "a", name: "A", amount: "100" },
          { id: "b", name: "B", amount: "200" },
        ]}
        rowKey={(r) => r.id}
      />
    );
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual(["ID", "Имя", "Сумма"]);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("100 ₸")).toBeTruthy(); // render-колонка
  });

  it("renders empty state when no rows", () => {
    render(<EntityList columns={columns} rows={[]} rowKey={(r) => r.id} />);
    expect(screen.getByText(/нет данных|пусто/i)).toBeTruthy();
  });
});
