import { describe, expect, it } from "vitest";
import { colorIdsToPassword, isColorId, nextSelectedColors } from "../colorPassword";

describe("color password", () => {
  it("validates ids", () => {
    expect(isColorId("C1")).toBe(true);
    expect(isColorId("C9")).toBe(true);
    expect(isColorId("C0")).toBe(false);
  });

  it("is order-insensitive and stable", () => {
    expect(colorIdsToPassword("C2", "C8")).toBe("TWSW-C2-C8");
    expect(colorIdsToPassword("C8", "C2")).toBe("TWSW-C2-C8");
  });

  it("toggles selection and prevents selecting more than 2", () => {
    expect(nextSelectedColors([], "C1")).toEqual(["C1"]);
    expect(nextSelectedColors(["C1"], "C2")).toEqual(["C1", "C2"]);
    expect(nextSelectedColors(["C1", "C2"], "C3")).toEqual(["C1", "C2"]);
    expect(nextSelectedColors(["C1", "C2"], "C2")).toEqual(["C1"]);
  });
});
