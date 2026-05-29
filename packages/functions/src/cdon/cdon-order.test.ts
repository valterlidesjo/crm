import { describe, it, expect } from "vitest";
import { parseCdonOrder } from "./cdon-order";

describe("parseCdonOrder", () => {
  it("normalises a snake_case order with order_rows", () => {
    const parsed = parseCdonOrder({
      order_id: "ORD-1001",
      order_number: "1001",
      currency: "SEK",
      total: "516.00",
      customer: { first_name: "Anna", last_name: "Svensson", email: "anna@example.com" },
      order_rows: [
        { article_row_id: "row-1", sku: "100-10-12", quantity: 2, title: "Luigi 40x40", price: "258.00" },
        { article_row_id: "row-2", sku: "100-10-13", quantity: 1 },
      ],
    });

    expect(parsed).not.toBeNull();
    expect(parsed!.orderId).toBe("ORD-1001");
    expect(parsed!.orderNumber).toBe("1001");
    expect(parsed!.currency).toBe("SEK");
    expect(parsed!.total).toBe(516);
    expect(parsed!.customerName).toBe("Anna Svensson");
    expect(parsed!.customerEmail).toBe("anna@example.com");
    expect(parsed!.rows).toHaveLength(2);
    expect(parsed!.rows[0]).toMatchObject({ sku: "100-10-12", quantity: 2, rowId: "row-1", price: 258 });
    expect(parsed!.rows[1]).toMatchObject({ sku: "100-10-13", quantity: 1 });
  });

  it("supports PascalCase marketplace-style fields", () => {
    const parsed = parseCdonOrder({
      OrderId: 9001,
      OrderRows: [{ OrderRowId: "r1", SKU: "ABC", Quantity: 3 }],
      Currency: "SEK",
    });

    expect(parsed!.orderId).toBe("9001");
    expect(parsed!.rows[0]).toMatchObject({ sku: "ABC", quantity: 3, rowId: "r1" });
  });

  it("defaults quantity to 1 when missing", () => {
    const parsed = parseCdonOrder({ id: "x", items: [{ sku: "S" }] });
    expect(parsed!.rows[0].quantity).toBe(1);
  });

  it("returns null without an order id", () => {
    expect(parseCdonOrder({ rows: [] })).toBeNull();
    expect(parseCdonOrder(null)).toBeNull();
    expect(parseCdonOrder("nope")).toBeNull();
  });

  it("handles an order with no rows", () => {
    const parsed = parseCdonOrder({ id: "empty" });
    expect(parsed!.rows).toEqual([]);
  });
});
