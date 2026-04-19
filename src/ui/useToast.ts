import { useCallback, useState } from "react";

export type ToastItem = { id: string; message: string };

export function useToast() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string) => {
      const id = crypto.randomUUID();
      setItems((prev) => [...prev, { id, message }]);
      window.setTimeout(() => remove(id), 2600);
    },
    [remove],
  );

  return { items, push, remove };
}

