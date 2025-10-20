export function mergeIds(...ids: Array<string | undefined | null>): string | undefined {
  const unique: string[] = [];
  for (const id of ids) {
    if (!id) {
      continue;
    }
    const parts = id.split(' ').map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      if (!unique.includes(part)) {
        unique.push(part);
      }
    }
  }
  return unique.length > 0 ? unique.join(' ') : undefined;
}
