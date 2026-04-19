import { type ColorId, colorIdsToPassword, isColorId } from "./colorPassword";
import { normalizeBytedanceEmailPrefix } from "./bytedanceEmail";

export type CredentialsResult =
  | { ok: true; email: string; password: string }
  | { ok: false; error: string };

export function buildBytedanceCredentials(prefixInput: string, selected: string[]): CredentialsResult {
  const normalized = normalizeBytedanceEmailPrefix(prefixInput);
  if (normalized.ok === false) {
    return { ok: false, error: normalized.error };
  }

  if (selected.length !== 2 || !isColorId(selected[0]) || !isColorId(selected[1])) {
    return { ok: false, error: "请选择 2 个色卡作为密码" };
  }

  const password = colorIdsToPassword(selected[0] as ColorId, selected[1] as ColorId);
  return { ok: true, email: normalized.email, password };
}

