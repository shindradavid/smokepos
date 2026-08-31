export interface PurchaseOrderTotalLine {
  quantity?: number | null;
  unitCost?: number | null;
}

export function calculatePurchaseOrderTotal(lines: PurchaseOrderTotalLine[] | null): number {
  return (lines ?? []).reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0),
    0
  );
}
