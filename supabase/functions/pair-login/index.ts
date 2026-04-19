import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

function json(body: Json, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-pair-action",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

function getEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function normalizeCode(input: unknown) {
  return typeof input === "string" ? input.trim().replace(/[\s-]+/g, "").toUpperCase() : "";
}

function randomCode() {
  const num = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(num).padStart(6, "0");
}

function nowIso() {
  return new Date().toISOString();
}

function addMinutesIso(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

const SUPABASE_URL = getEnv("SUPABASE_URL");
const SERVICE_ROLE = getEnv("SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return json({});
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: Json = {};
  try {
    body = (await req.json()) as Json;
  } catch {
    body = {};
  }

  const action = req.headers.get("x-pair-action") || "";
  if (action === "start") {
    const expiresAt = addMinutesIso(5);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = randomCode();
      const { error } = await admin.from("pair_logins").insert({
        code,
        status: "pending",
        expires_at: expiresAt,
        created_at: nowIso(),
      });
      if (!error) {
        return json({ code, expiresAt });
      }
    }
    return json({ error: "Failed to allocate code" }, { status: 500 });
  }

  if (action === "submit") {
    const code = normalizeCode(body.code);
    const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";

    if (!code || !accessToken || !refreshToken) {
      return json({ error: "Invalid request" }, { status: 400 });
    }

    const { data: row, error: loadErr } = await admin
      .from("pair_logins")
      .select("code,status,expires_at")
      .eq("code", code)
      .single();
    if (loadErr || !row) {
      return json({ error: "Code not found" }, { status: 404 });
    }

    const expiresAt = typeof row.expires_at === "string" ? row.expires_at : "";
    if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
      await admin.from("pair_logins").delete().eq("code", code);
      return json({ error: "Code expired" }, { status: 410 });
    }

    if (row.status !== "pending") {
      return json({ ok: true });
    }

    const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
    if (userErr || !userData?.user) {
      return json({ error: "Invalid session" }, { status: 401 });
    }

    const { error } = await admin
      .from("pair_logins")
      .update({
        status: "ready",
        access_token: accessToken,
        refresh_token: refreshToken,
        user_id: userData.user.id,
      })
      .eq("code", code);

    if (error) {
      return json({ error: "Failed to store pairing" }, { status: 500 });
    }

    return json({ ok: true });
  }

  if (action === "consume") {
    const code = normalizeCode(body.code);
    if (!code) {
      return json({ error: "Invalid request" }, { status: 400 });
    }

    const { data: row, error } = await admin
      .from("pair_logins")
      .select("code,status,access_token,refresh_token,expires_at")
      .eq("code", code)
      .single();

    if (error || !row) {
      return json({ error: "Code not found" }, { status: 404 });
    }

    const expiresAt = typeof row.expires_at === "string" ? row.expires_at : "";
    if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
      await admin.from("pair_logins").delete().eq("code", code);
      return json({ error: "Code expired" }, { status: 410 });
    }

    if (row.status !== "ready") {
      return json({ status: "pending" });
    }

    const accessToken = typeof row.access_token === "string" ? row.access_token : "";
    const refreshToken = typeof row.refresh_token === "string" ? row.refresh_token : "";
    if (!accessToken || !refreshToken) {
      await admin.from("pair_logins").delete().eq("code", code);
      return json({ status: "pending" });
    }

    await admin.from("pair_logins").delete().eq("code", code);
    return json({ status: "ready", accessToken, refreshToken });
  }

  return json({ error: "Unknown action" }, { status: 400 });
});
