import { normalizePairCode } from "./pairCode";
import { supabase } from "./supabaseClient";

export type PairStartResponse = { code: string; expiresAt: string };
export type PairConsumeResponse =
  | { status: "pending" }
  | { status: "ready"; accessToken: string; refreshToken: string };

function getFunctionUrl() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) {
    throw new Error("Missing VITE_SUPABASE_URL");
  }
  return `${url.replace(/\/$/, "")}/functions/v1/pair-login`;
}

async function postJson<T>(path: string, body: Record<string, unknown>, accessToken?: string): Promise<T> {
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!anon) {
    throw new Error("Missing VITE_SUPABASE_ANON_KEY");
  }

  const res = await fetch(getFunctionUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: anon,
      authorization: `Bearer ${accessToken ?? anon}`,
      "x-pair-action": path,
    },
    body: JSON.stringify(body),
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const errorValue =
      data && typeof data === "object" && "error" in data ? (data as { error?: unknown }).error : null;
    const message = errorValue ? String(errorValue) : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export async function startPairing(): Promise<PairStartResponse> {
  return postJson<PairStartResponse>("start", {});
}

export async function submitPairing(codeInput: string): Promise<void> {
  if (!supabase) {
    throw new Error("Cloud not configured");
  }
  const code = normalizePairCode(codeInput);
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) {
    throw new Error("Not logged in");
  }

  await postJson("submit", { code, accessToken: session.access_token, refreshToken: session.refresh_token }, session.access_token);
}

export async function consumePairing(codeInput: string): Promise<PairConsumeResponse> {
  const code = normalizePairCode(codeInput);
  return postJson<PairConsumeResponse>("consume", { code });
}
