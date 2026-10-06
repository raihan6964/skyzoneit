export const WITHDRAW_FEE_THRESHOLD = 1000;
export const WITHDRAW_FEE_UNDER_THRESHOLD = 5;
export const WITHDRAW_FEE_AT_THRESHOLD = 10;

export function withdrawalFee(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return amount >= WITHDRAW_FEE_THRESHOLD
    ? WITHDRAW_FEE_AT_THRESHOLD
    : WITHDRAW_FEE_UNDER_THRESHOLD;
}

export function rowFee(row: { amount: number; fee?: number | null }): number {
  const stored = row.fee;
  if (typeof stored === "number" && stored > 0) return stored;
  return withdrawalFee(row.amount);
}

export function rowNet(row: { amount: number; fee?: number | null }): number {
  return Math.max(row.amount - rowFee(row), 0);
}
