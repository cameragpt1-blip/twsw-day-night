import { useEffect, useMemo, useState } from "react";
import { getAuthRedirectTo } from "./redirect";
import { normalizePhone } from "./phone";
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

  const phone = useMemo(() => normalizePhone(phoneRaw), [phoneRaw]);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = window.setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

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

      setBusy(true);
      try {
        const emailRedirectTo = getAuthRedirectTo(new URL(window.location.href));
        const { error } = await supabase.auth.signInWithOtp({
          email: value,
          options: { emailRedirectTo },
        });
        if (error) {
          throw error;
        }
        setStep("email");
        onToast("登录链接已发送到邮箱");
      } catch (e) {
        const message = e instanceof Error ? e.message : "发送失败";
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

    setBusy(true);
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
                发送登录链接
              </button>
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
              获取验证码
            </button>
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
