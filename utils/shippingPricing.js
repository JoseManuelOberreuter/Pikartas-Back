/**
 * Totales de checkout: envío cotizado (sin impuesto adicional; precios con IVA incluido).
 */

export function getQuoteTolerancePesos() {
  const v = parseInt(process.env.STARKEN_QUOTE_TOLERANCE_PESOS ?? '50', 10);
  return Number.isFinite(v) && v >= 0 ? v : 50;
}

export function roundMoney(n) {
  return Math.round(Number(n));
}

/**
 * @param {number} subtotal
 * @param {number} quotedShipping - costo Starken domicilio
 * @returns {{ taxAmount: number, shippingAmount: number, totalAmount: number }}
 */
export function computeCheckoutTotals(subtotal, quotedShipping) {
  const taxAmount = 0;
  const shippingAmount = roundMoney(quotedShipping);
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
