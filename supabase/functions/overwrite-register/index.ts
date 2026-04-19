import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

function json(body: Json, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
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

function parseString(body: Json, key: string) {
  const v = body[key];
  return typeof v === "string" ? v.trim() : "";
}

function isBytedanceEmail(email: string) {
  return email.toLowerCase().endsWith("@bytedance.com") && email.includes("@");
}

function isColorPassword(password: string) {
  return /^TWSW-C[1-9]-C[1-9]$/.test(password);
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

  const email = parseString(body, "email");
  const password = parseString(body, "password");
  const emailKey = email.toLowerCase();

  if (!email || !password) {
    return json({ error: "Invalid request" }, { status: 400 });
  }
  if (!isBytedanceEmail(email)) {
    return json({ error: "Only @bytedance.com email allowed" }, { status: 400 });
  }
  if (!isColorPassword(password)) {
    return json({ error: "Invalid password format" }, { status: 400 });
  }

  try {
    const { data: limitRow, error: limitErr } = await admin
      .from("overwrite_register_limits")
      .select("last_used_at")
      .eq("email", emailKey)
      .maybeSingle();
    if (!limitErr && limitRow?.last_used_at) {
      const ts = Date.parse(String(limitRow.last_used_at));
      if (Number.isFinite(ts) && Date.now() - ts < 60 * 60 * 1000) {
        return json({ error: "overwrite-register rate limit exceeded" }, { status: 429 });
      }
    }

    const { data: found, error: findErr } = await admin.auth.admin.getUserByEmail(emailKey);
    if (!findErr && found?.user) {
      await admin.from("todos").delete().eq("user_id", found.user.id);
      await admin.auth.admin.deleteUser(found.user.id);
    }

    const { error: createErr } = await admin.auth.admin.createUser({
      email: emailKey,
      password,
      email_confirm: true,
    });
    if (createErr) {
      return json({ error: createErr.message }, { status: 400 });
    }

    await admin.from("overwrite_register_limits").upsert({ email: emailKey, last_used_at: new Date().toISOString() });
    return json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error";
    return json({ error: message }, { status: 500 });
  }
});
