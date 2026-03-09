const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function nanoid(size = 12): string {
  let id = "";
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < size; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return id;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

export function formatScore(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Bon";
  if (score >= 40) return "À améliorer";
  return "Critique";
}

export function scoreColor(score: number): "success" | "warning" | "critical" {
  if (score >= 70) return "success";
  if (score >= 40) return "warning";
  return "critical";
}
