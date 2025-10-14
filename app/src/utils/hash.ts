export function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function seededMod(value: string, modulo: number): number {
  if (modulo <= 0) {
    throw new Error('Modulo must be greater than zero.');
  }
  return hashString(value) % modulo;
}
