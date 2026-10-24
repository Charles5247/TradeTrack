/** Currency boundary shared by checkout display and persisted receipt lines. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > 9_999_999_999.99) throw new Error('Invalid currency amount');
  return Math.round((value + Math.sign(value) * 1e-9) * 100) / 100;
}
