import { describe, expect, it } from "vitest";
import { normalizeLocalTodosForImport } from "../importLocalTodos";

describe("normalizeLocalTodosForImport", () => {
  it("assigns sort_index and normalizes fields", () => {
    const raw = [
      { id: "a", title: "t1", owner: "o", dueDate: "2026-04-19", notes: "", done: false },
      { id: "b", title: "t2", owner: "", dueDate: "", notes: "n", done: true },
    ];
    const out = normalizeLocalTodosForImport(raw);
    expect(out[0].sort_index).toBe(0);
    expect(out[1].sort_index).toBe(1);
    expect(out[0].title).toBe("t1");
    expect(out[1].owner).toBe("");
    expect(out[0].due_date).toBe("2026-04-19");
  });
});

