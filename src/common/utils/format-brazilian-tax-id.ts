export function stripBrazilianTaxId(brazilianTaxId: string): string {
  return brazilianTaxId.replace(/\D/g, "");
}

export function formatBrazilianTaxId(brazilianTaxId: string): string {
  const digits = stripBrazilianTaxId(brazilianTaxId);
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export function isValidBrazilianTaxId(brazilianTaxId: string): boolean {
  const digits = stripBrazilianTaxId(brazilianTaxId);
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  const calc = (slice: string, weights: number[]) => {
    const sum = slice
      .split("")
      .reduce((acc, n, i) => acc + Number(n) * weights[i]!, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const d1 = calc(digits.slice(0, 12), w1);
  const d2 = calc(digits.slice(0, 12) + d1, w2);

  return digits.endsWith(`${d1}${d2}`);
}
