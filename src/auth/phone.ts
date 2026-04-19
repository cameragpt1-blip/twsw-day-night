export function normalizePhone(input: string) {
  const value = input.trim();
  if (!value) {
    return "";
  }
  if (value.startsWith("+")) {
    return value;
  }
  return `+86${value.replace(/\s+/g, "")}`;
}

