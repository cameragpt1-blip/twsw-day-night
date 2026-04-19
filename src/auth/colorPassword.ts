export type ColorId = `C${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

export function isColorId(value: string): value is ColorId {
  return /^C[1-9]$/.test(value);
}

export function colorIdsToPassword(a: ColorId, b: ColorId) {
  return [a, b].sort().join("-");
}

export function nextSelectedColors(current: ColorId[], next: ColorId): ColorId[] {
  if (current.includes(next)) {
    return current;
  }
  if (current.length < 2) {
    return [...current, next];
  }
  return [current[1], next];
}

export const COLOR_CARDS: Array<{ id: ColorId; hex: string; label: string }> = [
  { id: "C1", hex: "#5E7CFF", label: "蓝" },
  { id: "C2", hex: "#8B5CF6", label: "紫" },
  { id: "C3", hex: "#F97316", label: "橙" },
  { id: "C4", hex: "#22C55E", label: "绿" },
  { id: "C5", hex: "#06B6D4", label: "青" },
  { id: "C6", hex: "#E11D48", label: "玫红" },
  { id: "C7", hex: "#FACC15", label: "黄" },
  { id: "C8", hex: "#94A3B8", label: "银灰" },
  { id: "C9", hex: "#111827", label: "墨黑" },
];
