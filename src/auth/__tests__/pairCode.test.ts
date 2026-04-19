import { describe, expect, it } from "vitest";
import { normalizePairCode } from "../pairCode";

describe("normalizePairCode", () => {
  it("trims, removes spaces and hyphens, and uppercases", () => {
    expect(normalizePairCode(" ab-12 3c ")).toBe("AB123C");
  });
});

