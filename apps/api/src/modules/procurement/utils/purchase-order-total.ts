export interface PurchaseOrderLineAmount {
  quantity: number;
  unitCost: number;
}

export function calculatePurchaseOrderTotal(items: PurchaseOrderLineAmount[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
}
