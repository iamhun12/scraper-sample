import { addDays } from "./add-days";

export function getDefaultDates(validityDays: number): {
  issuedAt: string;
  validUntil: string;
} {
  const issued = new Date();
  return {
    issuedAt: issued.toISOString(),
    validUntil: addDays(issued, validityDays).toISOString(),
  };
}
