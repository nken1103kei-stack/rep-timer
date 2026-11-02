import { describe, expect, it } from "vitest";
import { pickQuote, QUOTE_COLORS, QUOTES } from "../../src/lib/quotes";

describe("quotes", () => {
  it("has all 21 parody quotes with unique ids and a color per category", () => {
    expect(QUOTES).toHaveLength(19);
    expect(new Set(QUOTES.map((q) => q.id)).size).toBe(19);
    for (const q of QUOTES) expect(QUOTE_COLORS[q.category]).toMatch(/^#[0-9A-F]{6}$/i);
    // No quotes about failing (dropped weights, injuries).
    expect(QUOTES.some((q) => (q.category as string) === "失敗")).toBe(false);
  });

  it("picks at random and never repeats the current quote", () => {
    expect(pickQuote(null, () => 0).id).toBe(1);
    expect(pickQuote(null, () => 0.9999).id).toBe(30);
    expect(pickQuote(1, () => 0).id).toBe(3);
    for (let i = 0; i < 50; i++) expect(pickQuote(9).id).not.toBe(9);
  });
});
