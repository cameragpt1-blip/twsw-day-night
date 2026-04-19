type OverwriteRegisterResponse = { ok: true };

function isOverwriteRegisterResponse(input: unknown): input is OverwriteRegisterResponse {
  return Boolean(input && typeof input === "object" && "ok" in input && (input as { ok?: unknown }).ok === true);
}

export async function overwriteRegister(email: string, password: string): Promise<OverwriteRegisterResponse> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anon) {
    throw new Error("云端未配置：需要 Supabase URL 和 anon key");
  }

  const endpoint = `${url.replace(/\/$/, "")}/functions/v1/overwrite-register`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: anon,
      authorization: `Bearer ${anon}`,
    },
    body: JSON.stringify({ email, password }),
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

  if (!isOverwriteRegisterResponse(data)) {
    throw new Error("Unexpected response");
  }

  return data;
}
