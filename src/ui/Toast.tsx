import type { ToastItem } from "./useToast";

export function Toast({ items, onRemove }: { items: ToastItem[]; onRemove: (id: string) => void }) {
  if (!items.length) {
    return null;
  }

  return (
    <div style={{ position: "fixed", left: 16, bottom: 16, zIndex: 50, display: "grid", gap: 10 }}>
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onRemove(t.id)}
          style={{
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(10,12,20,0.82)",
            color: "rgba(244,248,255,0.9)",
            padding: "10px 12px",
            borderRadius: 14,
            textAlign: "left",
            cursor: "pointer",
            maxWidth: 360,
          }}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

