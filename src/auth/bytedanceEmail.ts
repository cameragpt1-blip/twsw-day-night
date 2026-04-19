export type NormalizeResult =
  | { ok: true; email: string; prefix: string }
  | { ok: false; error: string };

const SUFFIX = "@bytedance.com";
const PREFIX_RE = /^[a-z0-9._-]{2,32}$/i;

export function normalizeBytedanceEmailPrefix(input: string): NormalizeResult {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, error: "请输入字节邮箱前缀" };
  }
  if (raw.includes("@")) {
    return { ok: false, error: "只需输入邮箱前缀" };
  }
  if (!PREFIX_RE.test(raw)) {
    return { ok: false, error: "仅允许字母数字及 . _ -" };
  }
  const prefix = raw.toLowerCase();
  return { ok: true, prefix, email: `${prefix}${SUFFIX}` };
}

