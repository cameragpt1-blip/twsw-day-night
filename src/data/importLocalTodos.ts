export type LocalTodo = {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  notes: string;
  done: boolean;
};

export type InsertTodoRow = {
  title: string;
  owner: string;
  due_date: string | null;
  notes: string;
  done: boolean;
  sort_index: number;
};

export function normalizeLocalTodosForImport(input: unknown): InsertTodoRow[] {
  const arr = Array.isArray(input) ? input : [];
  return arr.map((t, i) => {
    const todo = typeof t === "object" && t ? (t as Record<string, unknown>) : {};
    const title = typeof todo.title === "string" ? todo.title : "";
    const owner = typeof todo.owner === "string" ? todo.owner : "";
    const dueDate = typeof todo.dueDate === "string" ? todo.dueDate : "";
    const notes = typeof todo.notes === "string" ? todo.notes : "";
    const done = Boolean(todo.done);
    return {
      title,
      owner,
      due_date: dueDate ? dueDate : null,
      notes,
      done,
      sort_index: i,
    };
  });
}

