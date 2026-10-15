/**
 * All money is stored as integer paisa (1 NPR = 100 paisa) — see plan §49.
 * These helpers are the only place paisa-safe arithmetic lives on the backend.
 * No floating-point math ever touches a stored amount.
 */
export function multiplyPaisa(unitPricePaisa: number, quantity: number): number {
  return Math.round(unitPricePaisa * quantity);
}

export function sumPaisa(values: number[]): number {
  return Math.round(values.reduce((acc, value) => acc + value, 0));
}

export function maxPaisa(values: number[]): number {
  return values.length > 0 ? Math.max(...values) : 0;
}

export function minPaisa(values: number[]): number {
  return values.length > 0 ? Math.min(...values) : 0;
}

export function subtractPaisa(a: number, b: number): number {
  return Math.max(0, Math.round(a - b));
}

export function paisaToRupees(paisa: number): number {
  return paisa / 100;
}