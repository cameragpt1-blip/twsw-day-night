import { describe, expect, it } from "vitest";
import { normalizePhone } from "../phone";

describe("normalizePhone", () => {
  it("adds +86 by default", () => {
    expect(normalizePhone("13800138000")).toBe("+8613800138000");
  });

  it("keeps E.164", () => {
    expect(normalizePhone("+85291234567")).toBe("+85291234567");
  });
});

