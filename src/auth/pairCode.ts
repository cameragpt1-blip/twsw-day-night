export function normalizePairCode(input: string) {
  return input.trim().replace(/[\s-]+/g, "").toUpperCase();
}

