import { createClient } from "@supabase/supabase-js";

function getEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePrefix(prefix) {
  const raw = String(prefix ?? "").trim();
  if (!raw) {
    throw new Error("Missing prefix");
  }
  if (raw.includes("@")) {
    throw new Error("Prefix must not contain @");
  }
  if (!/^[a-z0-9._-]{2,32}$/i.test(raw)) {
    throw new Error("Invalid prefix");
  }
  return raw.toLowerCase();
}

function normalizeColorId(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!/^C[1-9]$/.test(raw)) {
    throw new Error(`Invalid color id: ${value}`);
  }
  return raw;
}

function buildPassword(colorA, colorB) {
  return [colorA, colorB].sort().join("-");
}

async function callOverwriteRegister({ supabaseUrl, anonKey, email, password }) {
  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/overwrite-register`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ email, password }),
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  return { ok: res.ok, status: res.status, json };
}

async function main() {
  const supabaseUrl = getEnv("VITE_SUPABASE_URL");
  const anonKey = getEnv("VITE_SUPABASE_ANON_KEY");
  const prefix = normalizePrefix(getEnv("TEST_BYTEDANCE_PREFIX"));
  const colorA = normalizeColorId(getEnv("TEST_COLOR_A"));
  const colorB = normalizeColorId(getEnv("TEST_COLOR_B"));

  const email = `${prefix}@bytedance.com`;
  const password = buildPassword(colorA, colorB);

  console.log("Using", { email, password });

  console.log("1) Calling overwrite-register…");
  const first = await callOverwriteRegister({ supabaseUrl, anonKey, email, password });
  console.log("overwrite-register response:", first.status, first.json);
  if (!first.ok || !first.json || first.json.ok !== true) {
    throw new Error("overwrite-register failed");
  }

  console.log("2) Signing in with password…");
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let lastError = null;
  for (const delay of [0, 350, 900]) {
    if (delay) {
      await sleep(delay);
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      lastError = null;
      break;
    }
    lastError = error;
  }
  if (lastError) {
    throw new Error(`signInWithPassword failed: ${lastError.message ?? String(lastError)}`);
  }

  const userRes = await supabase.auth.getUser();
  if (userRes.error || !userRes.data.user) {
    throw new Error(`getUser failed: ${userRes.error?.message ?? "missing user"}`);
  }

  console.log("Signed in as:", {
    id: userRes.data.user.id,
    email: userRes.data.user.email,
  });

  console.log("3) Rate limit check (second overwrite within an hour should fail)…");
  const second = await callOverwriteRegister({ supabaseUrl, anonKey, email, password });
  console.log("overwrite-register second response:", second.status, second.json);
  if (second.ok) {
    throw new Error("Expected rate limit to reject second overwrite-register call");
  }

  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

