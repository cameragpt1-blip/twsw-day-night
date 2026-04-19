import { useEffect, useMemo, useState } from "react";
import { buildBytedanceCredentials } from "./credentials";
import { overwriteRegister } from "./overwriteRegisterClient";
import { supabase } from "./supabaseClient";

export function OverwriteRegisterModal({
  prefix,
  selected,
  onClose,
  onToast,
  onDone,
}: {
  prefix: string;
  selected: string[];
  onClose: () => void;
  onToast: (message: string) => void;
  onDone: () => void;
}) {
  const credentials = useMemo(() => buildBytedanceCredentials(prefix, selected), [prefix, selected]);
  const [confirmPrefix, setConfirmPrefix] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(5);
  const [busy, setBusy] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }
    const timer = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  const canConfirm =
    secondsLeft === 0 &&
    credentials.ok &&
    confirmPrefix.trim().toLowerCase() === credentials.email.split("@")[0].toLowerCase();

  async function confirm() {
    if (!supabase) {
      onToast("云端未配置：需要 Supabase URL 和 anon key");
      return;
    }

    if (credentials.ok === false) {
      setInlineError(credentials.error);
      onToast(credentials.error);
      return;
    }

    if (!canConfirm) {
      setInlineError("请确认邮箱前缀并等待倒计时结束");
      return;
    }

    setBusy(true);
    setInlineError(null);
    try {
      await overwriteRegister(credentials.email, credentials.password);
      let lastError: unknown = null;
      for (const delay of [0, 350, 900]) {
        if (delay) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
        }
        const { error } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        });
        if (!error) {
          lastError = null;
          break;
        }
        lastError = error;
      }
      if (lastError) {
        throw lastError;
      }
      onDone();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "重新注册失败";
      setInlineError(message);
      onToast(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="auth-overlay"
      style={{ zIndex: 70 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="auth-modal">
        <div className="auth-header">
          <div className="auth-kicker">危险操作</div>
          <div className="auth-title">同名重新注册</div>
          <button type="button" onClick={onClose} className="auth-close">
            关闭
          </button>
        </div>

        <div className="auth-body">
          <div className="auth-selection">
            这会删除并重建账号，旧账号的云端 Todo 将被清空。
            {credentials.ok ? (
              <>
                <br />
                账号：<span style={{ fontWeight: 900 }}>{credentials.email}</span>
              </>
            ) : null}
          </div>

          <label className="auth-field">
            <span className="auth-label">再次输入邮箱前缀确认</span>
            <input
              value={confirmPrefix}
              onChange={(e) => setConfirmPrefix(e.target.value)}
              placeholder="请输入字节邮箱前缀"
              className="auth-input"
              autoComplete="off"
              inputMode="text"
            />
          </label>

          <button type="button" className="auth-primary" disabled={!canConfirm || busy} onClick={confirm}>
            {busy ? "处理中…" : secondsLeft > 0 ? `请等待 ${secondsLeft}s` : "确认清空并重新注册"}
          </button>

          {inlineError ? <div className="auth-error">{inlineError}</div> : null}
        </div>
      </div>
    </div>
  );
}
