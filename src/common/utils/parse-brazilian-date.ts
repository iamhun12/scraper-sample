export function parseBrazilianDate(value: string): Date {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) throw new Error(`Invalid Brazilian date: ${value}`);
  const [, day, month, year] = match;
  return new Date(`${year}-${month}-${day}T00:00:00Z`);
}
