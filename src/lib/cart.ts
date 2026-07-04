export interface CartItem {
  slug: string;
  title: string;
  variant: string;
  stripePriceId: string;
  price: number;
  quantity: number;
  image: string;
  isSubscription?: boolean;
}

const CART_KEY = 'cali-herb-farm-cart';

function readCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCart(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('cart-updated', { detail: items }));
}

export function getCart(): CartItem[] {
  return readCart();
}

export function addToCart(item: CartItem) {
  const cart = readCart();
  const existing = cart.find(
    (i) => i.slug === item.slug && i.variant === item.variant,
  );
  if (existing) {
    existing.quantity += item.quantity;
  } else {
    cart.push(item);
  }
  writeCart(cart);
}

export function removeFromCart(slug: string, variant: string) {
  const cart = readCart().filter(
    (i) => !(i.slug === slug && i.variant === variant),
  );
  writeCart(cart);
}

export function updateQuantity(slug: string, variant: string, quantity: number) {
  const cart = readCart();
  const item = cart.find(
    (i) => i.slug === slug && i.variant === variant,
  );
  if (item) {
    if (quantity <= 0) {
      removeFromCart(slug, variant);
      return;
    }
    item.quantity = quantity;
    writeCart(cart);
  }
}

export function getCartCount(): number {
  return readCart().reduce((sum, item) => sum + item.quantity, 0);
}

export function getCartTotal(): number {
  return readCart().reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function clearCart() {
  writeCart([]);
}
