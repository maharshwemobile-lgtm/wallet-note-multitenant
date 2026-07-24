export function autoInsertThreeDEquals(value: string): string {
  return value
    .split("\n")
    .map((line) => (/^\d{3}$/.test(line) ? `${line}=` : line))
    .join("\n");
}
