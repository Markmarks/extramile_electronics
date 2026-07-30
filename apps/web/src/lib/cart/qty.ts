/** Cart quantity rules. Pure — safe to unit test (U-09). */
export const MAX_QTY = 20;

/** Clamp a requested quantity to [0, min(MAX_QTY, available)]. */
export function clampQty(requested: number, available: number): number {
  if (!Number.isFinite(requested)) return 0;
  const cap = Math.min(MAX_QTY, Math.max(available, 0));
  return Math.max(0, Math.min(Math.floor(requested), cap));
}
