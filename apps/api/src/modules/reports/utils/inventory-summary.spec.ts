import { calculateInventorySummary } from './inventory-summary';

describe('calculateInventorySummary', () => {
  it('keeps retail and cost values explicit without a fallback', () => {
    const summary = calculateInventorySummary([
      { quantity: 10, price: 500, costPrice: 300, lowStockThreshold: 2 },
      { quantity: 2, price: 1_000, costPrice: null, lowStockThreshold: 2 },
      { quantity: 0, price: 2_000, costPrice: 1_500, lowStockThreshold: 1 },
    ]);

    expect(summary.totalRetailValue).toBe(7_000);
    expect(summary.totalCostValue).toBe(3_000);
    expect(summary.lowStockCount).toBe(1);
    expect(summary.outOfStockCount).toBe(1);
  });
});
