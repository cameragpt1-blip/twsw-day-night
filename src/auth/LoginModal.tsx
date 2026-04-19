import { useMemo, useState } from "react";
import { COLOR_CARDS, type ColorId, colorIdsToPassword, nextSelectedColors } from "./colorPassword";
import { buildBytedanceCredentials } from "./credentials";
import { OverwriteRegisterModal } from "./OverwriteRegisterModal";
import { supabase } from "./supabaseClient";

type View = "login" | "register";

export function LoginModal({
  onClose,
  onLoggedIn,
  onToast,
}: {
  onClose: () => void;
  onLoggedIn: () => void;
  onToast: (message: string) => void;
}) {
  const [view, setView] = useState<View>("login");
  const [prefix, setPrefix] = useState("");
  const [selected, setSelected] = useState<ColorId[]>([]);
  const [busy, setBusy] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [overwriteOpen, setOverwriteOpen] = useState(false);

  const credentials = useMemo(() => buildBytedanceCredentials(prefix, selected), [prefix, selected]);
  const canSubmit = Boolean(credentials.ok && !busy);
  const password = selected.length === 2 ? colorIdsToPassword(selected[0], selected[1]) : "";

  async function submit() {
    if (!supabase) {
      onToast("云端未配置：需要 Supabase URL 和 anon key");
      return;
    }

    if (credentials.ok === false) {
      setInlineError(credentials.error);
      onToast(credentials.error);
      return;
    }

    setBusy(true);
    setInlineError(null);
    try {
      if (view === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: credentials.email, password });
        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabase.auth.signUp({ email: credentials.email, password });
        if (error) {
          throw error;
        }
      }
      onLoggedIn();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : view === "login" ? "登录失败" : "注册失败";
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
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="auth-modal">
        <div className="auth-header">
          <div className="auth-kicker">云端备忘录</div>
          <div className="auth-title">{view === "login" ? "登录" : "注册"}</div>
          <button
            type="button"
            onClick={onClose}
            className="auth-close"
          >
            关闭
          </button>
        </div>

        <div className="auth-body">
          <label className="auth-field">
            <span className="auth-label">字节邮箱</span>
            <div className="auth-email-row">
              <input
                value={prefix}
                onChange={(e) => {
                  setPrefix(e.target.value);
                  if (inlineError) {
                    setInlineError(null);
                  }
                }}
                placeholder="请输入字节邮箱前缀"
                autoComplete="username"
                inputMode="text"
                className="auth-input auth-input--prefix"
              />
              <div className="auth-suffix" aria-hidden="true">
                @bytedance.com
              </div>
            </div>
          </label>

          <div className="auth-field">
            <div className="auth-label-row">
              <span className="auth-label">色卡密码</span>
              <span className="auth-hint">选择 2 个颜色</span>
            </div>
            <div className="auth-color-grid" role="list">
              {COLOR_CARDS.map((card) => {
                const isSelected = selected.includes(card.id);
                return (
                  <button
                    key={card.id}
                    type="button"
                    role="listitem"
                    className={`auth-color ${isSelected ? "is-selected" : ""}`}
                    onClick={() => {
                      setSelected((current) => {
                        if (!current.includes(card.id) && current.length >= 2) {
                          onToast("最多选择 2 个色卡");
                          return current;
                        }
                        return nextSelectedColors(current, card.id);
                      });
                      if (inlineError) {
                        setInlineError(null);
                      }
                    }}
                    aria-pressed={isSelected}
                  >
                    <div className="auth-color-head">
                      <span className="auth-color-swatch" style={{ background: card.hex }} aria-hidden="true"></span>
                      <span className={`auth-color-check ${isSelected ? "is-on" : ""}`} aria-hidden="true"></span>
                    </div>
                    <span className="auth-color-label">{card.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="auth-selection" aria-live="polite">
              {selected.length === 0
                ? "未选择"
                : selected.length === 1
                  ? `已选 1 个：${COLOR_CARDS.find((c) => c.id === selected[0])?.label ?? selected[0]}`
                  : `已选：${COLOR_CARDS.find((c) => c.id === selected[0])?.label ?? selected[0]} + ${
                      COLOR_CARDS.find((c) => c.id === selected[1])?.label ?? selected[1]
                    }`}
            </div>
          </div>

          <button type="button" className="auth-primary" disabled={!canSubmit} onClick={submit}>
            {busy ? "处理中…" : view === "login" ? "登录" : "注册并登录"}
          </button>

          {inlineError ? <div className="auth-error">{inlineError}</div> : null}

          <div className="auth-footer">
            {view === "login" ? (
              <button
                type="button"
                className="auth-link"
                onClick={() => {
                  setView("register");
                  setInlineError(null);
                }}
              >
                没有账号？去注册
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => {
                    setView("login");
                    setInlineError(null);
                  }}
                >
                  已有账号？去登录
                </button>
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => {
                    setOverwriteOpen(true);
                  }}
                >
                  忘记密码？重新注册
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {overwriteOpen ? (
        <OverwriteRegisterModal
          prefix={prefix}
          selected={selected}
          onClose={() => setOverwriteOpen(false)}
          onToast={onToast}
          onDone={() => {
            onToast("重新注册成功");
            onLoggedIn();
          }}
        />
      ) : null}
    </div>
  );
}
