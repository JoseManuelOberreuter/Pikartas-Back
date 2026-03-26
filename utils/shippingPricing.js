/**
 * Totales de checkout: impuesto, envío gratis, comparación con cotización cliente.
 */

export function getTaxRate() {
  const r = parseFloat(process.env.SHOP_TAX_RATE ?? '0.08');
  return Number.isFinite(r) && r >= 0 ? r : 0.08;
}

export function getFreeShippingMinSubtotal() {
  const v = parseFloat(process.env.FREE_SHIPPING_MIN_SUBTOTAL ?? '500');
  return Number.isFinite(v) && v >= 0 ? v : 500;
}

export function getQuoteTolerancePesos() {
  const v = parseInt(process.env.STARKEN_QUOTE_TOLERANCE_PESOS ?? '50', 10);
  return Number.isFinite(v) && v >= 0 ? v : 50;
}

export function roundMoney(n) {
  return Math.round(Number(n));
}

/**
 * @param {number} subtotal
 * @param {number} quotedShipping - costo Starken domicilio (antes de regla gratis)
 * @returns {{ taxAmount: number, shippingAmount: number, totalAmount: number }}
 */
export function computeCheckoutTotals(subtotal, quotedShipping) {
  const taxRate = getTaxRate();
  const taxAmount = roundMoney(subtotal * taxRate);
  const freeMin = getFreeShippingMinSubtotal();
  const shippingAmount = subtotal >= freeMin ? 0 : roundMoney(quotedShipping);
  const totalAmount = roundMoney(subtotal + taxAmount + shippingAmount);
  return { taxAmount, shippingAmount, totalAmount };
}

/**
 * @param {number|null|undefined} clientShipping - envío que mostró el frontend
 * @param {number} serverShipping
 */
export function shippingMatchesClient(clientShipping, serverShipping) {
  if (clientShipping === undefined || clientShipping === null) return true;
  const tol = getQuoteTolerancePesos();
  return Math.abs(roundMoney(clientShipping) - roundMoney(serverShipping)) <= tol;
}
