import { describe, expect, it } from "vitest";
import { normalizeBytedanceEmailPrefix } from "../bytedanceEmail";

describe("normalizeBytedanceEmailPrefix", () => {
  it("rejects empty or contains @", () => {
    expect(normalizeBytedanceEmailPrefix("")).toEqual({ ok: false, error: "请输入字节邮箱前缀" });
    expect(normalizeBytedanceEmailPrefix("a@b")).toEqual({ ok: false, error: "只需输入邮箱前缀" });
  });

  it("accepts prefix and builds @bytedance.com email", () => {
    expect(normalizeBytedanceEmailPrefix("zhangsan")).toEqual({
      ok: true,
      prefix: "zhangsan",
      email: "zhangsan@bytedance.com",
    });
  });

  it("rejects invalid chars", () => {
    expect(normalizeBytedanceEmailPrefix("张三")).toEqual({ ok: false, error: "仅允许字母数字及 . _ -" });
    expect(normalizeBytedanceEmailPrefix("a b")).toEqual({ ok: false, error: "仅允许字母数字及 . _ -" });
  });
});

