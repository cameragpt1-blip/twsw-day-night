import { supabase } from "../auth/supabaseClient";

export type CloudTodo = {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  notes: string;
  done: boolean;
  sortIndex: number;
};

function assertSupabase() {
  if (!supabase) {
    throw new Error("Cloud not configured");
  }
  return supabase;
}

function rowToTodo(row: Record<string, unknown>): CloudTodo {
  return {
    id: String(row.id ?? ""),
    title: typeof row.title === "string" ? row.title : "",
    owner: typeof row.owner === "string" ? row.owner : "",
    dueDate: typeof row.due_date === "string" ? row.due_date : "",
    notes: typeof row.notes === "string" ? row.notes : "",
    done: Boolean(row.done),
    sortIndex: typeof row.sort_index === "number" ? row.sort_index : Number(row.sort_index ?? 0),
  };
}

export async function listTodos(): Promise<CloudTodo[]> {
  const client = assertSupabase();
  const { data, error } = await client.from("todos").select("*").order("sort_index", { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []).map((row) => rowToTodo(row as Record<string, unknown>));
}

export async function createTodo(input: Omit<CloudTodo, "id">): Promise<CloudTodo> {
  const client = assertSupabase();
  const user = (await client.auth.getUser()).data.user;
  if (!user) {
    throw new Error("Not logged in");
  }
  const { data, error } = await client
    .from("todos")
    .insert({
      user_id: user.id,
      title: input.title,
      owner: input.owner,
      due_date: input.dueDate ? input.dueDate : null,
      notes: input.notes,
      done: input.done,
      sort_index: input.sortIndex,
    })
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  return rowToTodo(data as Record<string, unknown>);
}

export async function updateTodo(
  id: string,
  patch: Partial<Pick<CloudTodo, "title" | "owner" | "dueDate" | "notes" | "done" | "sortIndex">>,
): Promise<void> {
  const client = assertSupabase();
  const payload: Record<string, unknown> = {};
  if (patch.title !== undefined) payload.title = patch.title;
  if (patch.owner !== undefined) payload.owner = patch.owner;
  if (patch.dueDate !== undefined) payload.due_date = patch.dueDate ? patch.dueDate : null;
  if (patch.notes !== undefined) payload.notes = patch.notes;
  if (patch.done !== undefined) payload.done = patch.done;
  if (patch.sortIndex !== undefined) payload.sort_index = patch.sortIndex;
  const { error } = await client.from("todos").update(payload).eq("id", id);
  if (error) {
    throw error;
  }
}

export async function deleteTodo(id: string): Promise<void> {
  const client = assertSupabase();
  const { error } = await client.from("todos").delete().eq("id", id);
  if (error) {
    throw error;
  }
}

export async function reorderTodos(idsInOrder: string[]): Promise<void> {
  const client = assertSupabase();
  const updates = idsInOrder.map((id, index) => ({ id, sort_index: index }));
  const { error } = await client.from("todos").upsert(updates, { onConflict: "id" });
  if (error) {
    throw error;
  }
}

export async function bulkInsertTodos(
  rows: Array<{ title: string; owner: string; due_date: string | null; notes: string; done: boolean; sort_index: number }>,
): Promise<void> {
  const client = assertSupabase();
  const user = (await client.auth.getUser()).data.user;
  if (!user) {
    throw new Error("Not logged in");
  }
  const payload = rows.map((r) => ({ ...r, user_id: user.id }));
  const { error } = await client.from("todos").insert(payload);
  if (error) {
    throw error;
  }
}

