import { Product } from '../../core/models/product.model';

export interface PosCartItem {
  product: Product;
  quantity: number;
}

export function addProductToCart(cart: PosCartItem[], product: Product): PosCartItem[] {
  if (product.quantity < 1) return cart;

  const existing = cart.find((item) => item.product.id === product.id);
  if (!existing) return [...cart, { product, quantity: 1 }];
  if (existing.quantity >= product.quantity) return cart;

  return cart.map((item) =>
    item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
  );
}

export function setCartItemQuantity(
  cart: PosCartItem[],
  productId: string,
  requestedQuantity: number
): PosCartItem[] {
  if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
    return cart.filter((item) => item.product.id !== productId);
  }

  return cart.map((item) =>
    item.product.id === productId
      ? { ...item, quantity: Math.min(requestedQuantity, item.product.quantity) }
      : item
  );
}

export function calculateCartSubtotal(cart: PosCartItem[]): number {
  return cart.reduce((total, item) => total + Number(item.product.price) * item.quantity, 0);
}

export function calculateChange(amountTendered: number, total: number): number {
  return Math.max(Number(amountTendered || 0) - Number(total || 0), 0);
}
