export interface InventoryValueProduct {
  quantity: number;
  price: number;
  costPrice: number | null;
  lowStockThreshold: number;
}

export function calculateInventorySummary(products: InventoryValueProduct[]) {
  return products.reduce(
    (summary, product) => {
      summary.totalRetailValue += product.quantity * product.price;
      summary.totalCostValue += product.quantity * (product.costPrice ?? 0);
      summary.totalQuantity += product.quantity;

      if (product.quantity === 0) summary.outOfStockCount += 1;
      else if (product.quantity <= product.lowStockThreshold) summary.lowStockCount += 1;

      return summary;
    },
    {
      totalRetailValue: 0,
      totalCostValue: 0,
      totalQuantity: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
    }
  );
}
