import { describe, expect, it } from "vitest";
import { getAuthRedirectTo } from "../redirect";

describe("getAuthRedirectTo", () => {
  it("returns origin + pathname without hash and search", () => {
    const url = new URL("https://cameragpt1-blip.github.io/twsw-day-night/#/?x=1");
    expect(getAuthRedirectTo(url)).toBe("https://cameragpt1-blip.github.io/twsw-day-night/");
  });

  it("can append hash route path", () => {
    const url = new URL("https://cameragpt1-blip.github.io/twsw-day-night/#/?x=1");
    expect(getAuthRedirectTo(url, "/pair")).toBe("https://cameragpt1-blip.github.io/twsw-day-night/#/pair");
  });
});
