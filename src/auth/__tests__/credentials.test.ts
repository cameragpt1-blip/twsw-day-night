import { describe, expect, it } from "vitest";
import { buildBytedanceCredentials } from "../credentials";

describe("buildBytedanceCredentials", () => {
  it("requires valid prefix and exactly two colors", () => {
    expect(buildBytedanceCredentials("", ["C1", "C2"])).toEqual({ ok: false, error: "请输入字节邮箱前缀" });
    expect(buildBytedanceCredentials("zhangsan", ["C1"])).toEqual({ ok: false, error: "请选择 2 个色卡作为密码" });
  });

  it("builds email and stable password", () => {
    expect(buildBytedanceCredentials("zhangsan", ["C8", "C2"])).toEqual({
      ok: true,
      email: "zhangsan@bytedance.com",
      password: "TWSW-C2-C8",
    });
  });
});
