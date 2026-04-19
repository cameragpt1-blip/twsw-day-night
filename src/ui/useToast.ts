import { useCallback, useState } from "react";

export type ToastItem = { id: string; message: string };

function createToastId() {
  const maybeCrypto = globalThis.crypto as Crypto | undefined;
  if (maybeCrypto?.randomUUID) {
    return maybeCrypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useToast() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string) => {
      const id = createToastId();
      setItems((prev) => [...prev, { id, message }]);
      window.setTimeout(() => remove(id), 6500);
    },
    [remove],
  );

  return { items, push, remove };
}
