import { Product } from '../../core/models/product.model';
import {
  addProductToCart,
  calculateCartSubtotal,
  calculateChange,
  setCartItemQuantity,
} from './pos-cart.utils';

const product = (overrides: Partial<Product> = {}): Product =>
  ({
    id: 'product-1',
    name: 'Blue Pen',
    branchId: 'branch-1',
    price: 1500,
    costPrice: 1000,
    isActive: true,
    quantity: 12,
    lowStockThreshold: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Product;

describe('POS cart helpers', () => {
  it('adds one retail unit and increments the same product for wholesale quantities', () => {
    const one = addProductToCart([], product());
    const two = addProductToCart(one, product());

    expect(one[0].quantity).toBe(1);
    expect(two[0].quantity).toBe(2);
  });

  it('caps entered quantities at available stock', () => {
    const cart = addProductToCart([], product({ quantity: 12 }));

    expect(setCartItemQuantity(cart, 'product-1', 20)[0].quantity).toBe(12);
  });

  it('calculates subtotal and cash change', () => {
    const cart = [{ product: product(), quantity: 12 }];

    expect(calculateCartSubtotal(cart)).toBe(18000);
    expect(calculateChange(20000, 18000)).toBe(2000);
  });
});
