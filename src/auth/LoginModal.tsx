import { useEffect, useMemo, useRef, useState } from "react";
import { getAuthRedirectTo } from "./redirect";
import { normalizePhone } from "./phone";
import { consumePairing, startPairing } from "./pairLoginClient";
import { supabase } from "./supabaseClient";

type Mode = "phone" | "email";
type Step = "phone" | "otp" | "email";

export function LoginModal({
  onClose,
  onLoggedIn,
  onToast,
}: {
  onClose: () => void;
  onLoggedIn: () => void;
  onToast: (message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("phone");
  const [step, setStep] = useState<Step>("phone");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState("");
  const [pairExpiresAt, setPairExpiresAt] = useState("");
  const pollingRef = useRef<number | null>(null);

  const phone = useMemo(() => normalizePhone(phoneRaw), [phoneRaw]);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = window.setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  async function sendOtp() {
    if (!supabase) {
      onToast("云端未配置：需要 Supabase URL 和 anon key");
      return;
    }

    if (mode === "email") {
      const value = email.trim();
      if (!value.includes("@")) {
        onToast("请输入正确邮箱");
        return;
      }
      if (cooldown > 0) {
        onToast(`请稍后再试（${cooldown}s）`);
        return;
      }

      setBusy(true);
      setInlineError(null);
      try {
        const emailRedirectTo = getAuthRedirectTo(new URL(window.location.href), "/pair");
        const { error } = await supabase.auth.signInWithOtp({
          email: value,
          options: { emailRedirectTo },
        });
        if (error) {
          throw error;
        }
        setStep("email");
        setCooldown(60);
        onToast("登录链接已发送到邮箱");
      } catch (e) {
        const message = e instanceof Error ? e.message : "发送失败";
        setInlineError(message);
        if (message.toLowerCase().includes("rate limit")) {
          setCooldown(60);
        }
        onToast(message);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!phone || phone.length < 8) {
      onToast("请输入正确手机号");
      return;
    }
    if (cooldown > 0) {
      onToast(`请稍后再试（${cooldown}s）`);
      return;
    }

    setBusy(true);
    setInlineError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone });
      if (error) {
        throw error;
      }
      setStep("otp");
      setCooldown(60);
      onToast("验证码已发送");
    } catch (e) {
      const message = e instanceof Error ? e.message : "发送失败";
      setInlineError(message);
      onToast(message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    if (!supabase) {
      onToast("云端未配置：需要 Supabase URL 和 anon key");
      return;
    }
    if (!otp || otp.length < 4) {
      onToast("请输入验证码");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ phone, token: otp, type: "sms" });
      if (error) {
        throw error;
      }
      onLoggedIn();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "验证失败";
      onToast(message);
    } finally {
      setBusy(false);
    }
  }

  async function beginPairing() {
    if (!supabase) {
      onToast("云端未配置：需要 Supabase URL 和 anon key");
      return;
    }
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setBusy(true);
    try {
      const res = await startPairing();
      setPairCode(res.code);
      setPairExpiresAt(res.expiresAt);
      onToast("配对码已生成");
    } catch (e) {
      const message = e instanceof Error ? e.message : "生成失败";
      onToast(message);
    } finally {
      setBusy(false);
    }
  }

  async function tryConsumePairing() {
    if (!supabase) {
      onToast("云端未配置：需要 Supabase URL 和 anon key");
      return;
    }
    const code = pairCode.trim();
    if (!code) {
      onToast("请先生成配对码");
      return;
    }
    setBusy(true);
    try {
      const res = await consumePairing(code);
      if (res.status !== "ready") {
        onToast("还未完成配对，请在手机输入配对码后再试");
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: res.accessToken,
        refresh_token: res.refreshToken,
      });
      if (error) {
        throw error;
      }
      onLoggedIn();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "配对失败";
      onToast(message);
    } finally {
      setBusy(false);
    }
  }

  function startPolling() {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    pollingRef.current = window.setInterval(() => {
      void (async () => {
        if (!supabase) {
          return;
        }
        const code = pairCode.trim();
        if (!code) {
          return;
        }
        try {
          const res = await consumePairing(code);
          if (res.status !== "ready") {
            return;
          }
          const { error } = await supabase.auth.setSession({
            access_token: res.accessToken,
            refresh_token: res.refreshToken,
          });
          if (error) {
            return;
          }
          if (pollingRef.current) {
            window.clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          onLoggedIn();
          onClose();
        } catch {
          return;
        }
      })();
    }, 1500);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.46)",
        padding: 18,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,0.16)",
          background: "rgba(10,12,20,0.86)",
          padding: 16,
          boxShadow: "0 22px 72px rgba(0,0,0,0.58)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 12 }}>
            登录以同步到云端
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 0,
              background: "transparent",
              color: "rgba(244,248,255,0.72)",
              cursor: "pointer",
            }}
          >
            关闭
          </button>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              setMode("phone");
              setStep("phone");
              setOtp("");
              setCooldown(0);
            }}
            style={{
              border: "1px solid rgba(255,255,255,0.16)",
              background: mode === "phone" ? "rgba(169,194,255,0.18)" : "rgba(5,6,12,0.62)",
              color: "rgba(244,248,255,0.86)",
              borderRadius: 999,
              padding: "8px 10px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            手机号
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("email");
              setStep("phone");
              setOtp("");
              setCooldown(0);
            }}
            style={{
              border: "1px solid rgba(255,255,255,0.16)",
              background: mode === "email" ? "rgba(169,194,255,0.18)" : "rgba(5,6,12,0.62)",
              color: "rgba(244,248,255,0.86)",
              borderRadius: 999,
              padding: "8px 10px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            邮箱
          </button>
        </div>

        {mode === "email" ? (
          step === "email" ? (
            <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              <div style={{ fontSize: 13, color: "rgba(244,248,255,0.78)" }}>
                已发送登录链接到 <span style={{ fontWeight: 800 }}>{email.trim()}</span>，请打开邮箱点击链接完成登录。
              </div>
              <div
                style={{
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(5,6,12,0.62)",
                  borderRadius: 16,
                  padding: 12,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 12, color: "rgba(244,248,255,0.64)", letterSpacing: "0.08em" }}>
                  跨设备登录（手机邮箱 → 电脑网页）
                </div>
                <div style={{ fontSize: 13, color: "rgba(244,248,255,0.78)" }}>
                  如果你在手机邮箱点击了链接：手机会打开 <span style={{ fontWeight: 800 }}>配对页</span>，在手机输入电脑上的配对码即可让电脑登录。
                </div>
                {pairCode ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "0.12em" }}>{pairCode}</div>
                      <div style={{ fontSize: 12, color: "rgba(244,248,255,0.6)" }}>
                        {pairExpiresAt ? `有效期至 ${new Date(pairExpiresAt).toLocaleTimeString()}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <button
                        type="button"
                        onClick={tryConsumePairing}
                        disabled={busy}
                        style={{
                          height: 46,
                          borderRadius: 14,
                          border: 0,
                          background: "linear-gradient(180deg, rgba(169,194,255,0.92), rgba(79,110,232,0.98))",
                          color: "rgba(7,10,14,0.96)",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        我已在手机完成
                      </button>
                      <button
                        type="button"
                        onClick={startPolling}
                        disabled={busy}
                        style={{
                          height: 46,
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,0.16)",
                          background: "rgba(5,6,12,0.62)",
                          color: "rgba(244,248,255,0.86)",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        自动检测
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={beginPairing}
                    disabled={busy}
                    style={{
                      height: 46,
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.16)",
                      background: "rgba(5,6,12,0.62)",
                      color: "rgba(244,248,255,0.86)",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    生成电脑配对码
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                style={{
                  height: 46,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(5,6,12,0.62)",
                  color: "rgba(244,248,255,0.86)",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                我知道了
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "rgba(244,248,255,0.64)" }}>邮箱</span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                  inputMode="email"
                  style={{
                    height: 46,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(5,6,12,0.62)",
                    color: "rgba(244,248,255,0.9)",
                    padding: "0 12px",
                  }}
                />
              </label>
              <button
                type="button"
                onClick={sendOtp}
                disabled={busy || cooldown > 0}
                style={{
                  height: 46,
                  borderRadius: 14,
                  border: 0,
                  background: "linear-gradient(180deg, rgba(169,194,255,0.92), rgba(79,110,232,0.98))",
                  color: "rgba(7,10,14,0.96)",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {busy ? "发送中…" : cooldown > 0 ? `稍后再试（${cooldown}s）` : "发送登录链接"}
              </button>
              {inlineError ? (
                <div style={{ fontSize: 12, color: "rgba(255, 186, 186, 0.92)" }}>{inlineError}</div>
              ) : null}
            </div>
          )
        ) : step === "phone" ? (
          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "rgba(244,248,255,0.64)" }}>手机号</span>
              <input
                value={phoneRaw}
                onChange={(e) => setPhoneRaw(e.target.value)}
                placeholder="例如 13800138000"
                autoComplete="tel"
                inputMode="tel"
                style={{
                  height: 46,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(5,6,12,0.62)",
                  color: "rgba(244,248,255,0.9)",
                  padding: "0 12px",
                }}
              />
            </label>
            <button
              type="button"
              onClick={sendOtp}
              disabled={busy || cooldown > 0}
              style={{
                height: 46,
                borderRadius: 14,
                border: 0,
                background: "linear-gradient(180deg, rgba(169,194,255,0.92), rgba(79,110,232,0.98))",
                color: "rgba(7,10,14,0.96)",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {busy ? "发送中…" : cooldown > 0 ? `稍后再试（${cooldown}s）` : "获取验证码"}
            </button>
            {inlineError ? (
              <div style={{ fontSize: 12, color: "rgba(255, 186, 186, 0.92)" }}>{inlineError}</div>
            ) : null}
          </div>
        ) : (
          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, color: "rgba(244,248,255,0.64)" }}>验证码</span>
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="6 位验证码"
                autoComplete="one-time-code"
                inputMode="numeric"
                style={{
                  height: 46,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(5,6,12,0.62)",
                  color: "rgba(244,248,255,0.9)",
                  padding: "0 12px",
                }}
              />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                type="button"
                onClick={verifyOtp}
                disabled={busy}
                style={{
                  height: 46,
                  borderRadius: 14,
                  border: 0,
                  background: "linear-gradient(180deg, rgba(169,194,255,0.92), rgba(79,110,232,0.98))",
                  color: "rgba(7,10,14,0.96)",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                登录
              </button>
              <button
                type="button"
                onClick={sendOtp}
                disabled={busy || cooldown > 0}
                style={{
                  height: 46,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(5,6,12,0.62)",
                  color: "rgba(244,248,255,0.86)",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {cooldown > 0 ? `重发 (${cooldown}s)` : "重发验证码"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
