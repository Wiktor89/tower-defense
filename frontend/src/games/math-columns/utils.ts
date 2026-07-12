export function splitDigits(num: number, width: number): string[] {
  return String(num).padStart(width, ' ').split('');
}
