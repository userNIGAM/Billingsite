/**
 * All money moves through the API as integer paisa (1 NPR = 100 paisa) —
 * see backend §49. These helpers are the ONLY place paisa is converted to
 * a displayed rupee amount, so rounding/formatting stays consistent.
 */

export function paisaToRupees(paisa: number): number {
  return paisa / 100;
}

export function rupeesToPaisa(rupees: number): number {
  return Math.round(rupees * 100);
}

export function formatNPR(paisa: number): string {
  const rupees = paisaToRupees(paisa);
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(rupees)
    .replace('NPR', 'NPR ');
}
