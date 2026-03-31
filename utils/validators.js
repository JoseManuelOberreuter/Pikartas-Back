// utils/validators.js
// Validadores centralizados para toda la aplicación

import { productService } from '../models/productModel.js';

// ============================================
// VALIDADORES GENÉRICOS (Reutilizables)
// ============================================

/**
 * Valida un ID numérico genérico
 * @param {string|number} id - ID a validar
 * @param {string} fieldName - Nombre del campo para mensajes de error
 * @returns {{isValid: boolean, id: number|null, error: string|null}}
 */
export const validateId = (id, fieldName = 'ID') => {
  if (!id) {
    return { isValid: false, id: null, error: `${fieldName} requerido` };
  }
  
  const idInt = parseInt(id);
  if (isNaN(idInt) || idInt <= 0) {
    return { isValid: false, id: null, error: `${fieldName} inválido` };
  }
  
  return { isValid: true, id: idInt, error: null };
};

/**
 * Valida un número positivo
 * @param {string|number} value - Valor a validar
 * @param {string} fieldName - Nombre del campo para mensajes de error
 * @param {boolean} allowZero - Si permite cero
 * @returns {{isValid: boolean, value: number|null, error: string|null}}
 */
export const validatePositiveNumber = (value, fieldName = 'Número', allowZero = false) => {
  if (value === undefined || value === null || value === '') {
    return { isValid: false, value: null, error: `${fieldName} requerido` };
  }
  
  const num = parseFloat(value);
  const minValue = allowZero ? 0 : 1;
  
  if (isNaN(num) || num < minValue) {
    return {
      isValid: false,
      value: null,
      error: `${fieldName} debe ser un número ${allowZero ? 'mayor o igual a 0' : 'mayor a 0'}`
    };
  }
  
  return { isValid: true, value: num, error: null };
};

/**
 * Valida un número entero positivo
 * @param {string|number} value - Valor a validar
 * @param {string} fieldName - Nombre del campo para mensajes de error
 * @param {boolean} allowZero - Si permite cero
 * @returns {{isValid: boolean, value: number|null, error: string|null}}
 */
export const validatePositiveInteger = (value, fieldName = 'Número', allowEmpty = false) => {
  if (allowEmpty && (value === undefined || value === null || value === '')) {
    return { isValid: true, value: null, error: null };
  }
  
  if (value === undefined || value === null || value === '') {
    return { isValid: false, value: null, error: `${fieldName} requerido` };
  }
  
  const num = parseInt(value);
  if (isNaN(num) || num < 0) {
    return {
      isValid: false,
      value: null,
      error: `${fieldName} debe ser un número entero mayor o igual a 0`
    };
  }
  
  return { isValid: true, value: num, error: null };
};

/**
 * Valida campos requeridos genéricos
 * @param {object} data - Datos a validar
 * @param {string[]} requiredFields - Lista de campos requeridos
 * @returns {{isValid: boolean, missingFields: string[]}}
 */
export const validateRequiredFields = (data, requiredFields) => {
  const missingFields = requiredFields.filter(field => !data[field]);
  
  return {
    isValid: missingFields.length === 0,
    missingFields
  };
};

// ============================================
// VALIDADORES DE PRODUCTOS
// ============================================

/**
 * Valida el ID de un producto (acepta números enteros o UUIDs/strings)
 * @param {string|number} id - ID a validar
 * @returns {{isValid: boolean, id: string|number|null, error: string|null}}
 */
export const validateProductId = (id) => {
  if (!id) {
    return { isValid: false, id: null, error: 'ID de producto requerido' };
  }
  
  // Convert to string for validation
  const idStr = String(id).trim();
  
  if (idStr === '') {
    return { isValid: false, id: null, error: 'ID de producto inválido' };
  }
  
  // Try to validate as integer first (for backward compatibility)
  const idInt = parseInt(idStr);
  if (!isNaN(idInt) && idInt > 0) {
    return { isValid: true, id: idInt, error: null };
  }
  
  // If not a valid integer, accept as string (for UUIDs and other string IDs)
  // UUID format: 8-4-4-4-12 hexadecimal characters
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(idStr)) {
    return { isValid: true, id: idStr, error: null };
  }
  
  // Accept any non-empty string (for other ID formats)
  if (idStr.length > 0) {
    return { isValid: true, id: idStr, error: null };
  }
  
  return { isValid: false, id: null, error: 'ID de producto inválido' };
};

/**
 * Valida el precio de un producto
 * @param {string|number} price - Precio a validar
 * @returns {{isValid: boolean, value: number|null, error: string|null}} (misma forma que validatePositiveNumber)
 */
export const validatePrice = (price) => {
  return validatePositiveNumber(price, 'Precio', true);
};

/**
 * Valida el stock de un producto
 * @param {string|number} stock - Stock a validar
 * @param {boolean} allowEmpty - Si permite stock vacío (para updates)
 * @returns {{isValid: boolean, stock: number|null, error: string|null}}
 */
export const validateStock = (stock, allowEmpty = false) => {
  const result = validatePositiveInteger(stock, 'Stock', allowEmpty);
  return {
    isValid: result.isValid,
    stock: result.value,
    error: result.error
  };
};

/**
 * Valida campos requeridos de producto
 * @param {object} data - Datos del producto
 * @returns {{isValid: boolean, missingFields: string[]}}
 */
export const validateProductRequiredFields = (data) => {
  return validateRequiredFields(data, ['name', 'description', 'price', 'category']);
};

/**
 * Valida el porcentaje de descuento (0-100)
 * @param {string|number} discountPercentage - Porcentaje de descuento a validar
 * @returns {{isValid: boolean, percentage: number|null, error: string|null}}
 */
export const validateDiscountPercentage = (discountPercentage) => {
  if (discountPercentage === undefined || discountPercentage === null || discountPercentage === '') {
    return { isValid: false, percentage: null, error: 'Porcentaje de descuento requerido para productos en oferta' };
  }

  const percentage = parseFloat(discountPercentage);
  if (isNaN(percentage) || percentage < 0 || percentage >= 100) {
    return { isValid: false, percentage: null, error: 'El porcentaje de descuento debe estar entre 0 y 99.99' };
  }

  return { isValid: true, percentage, error: null };
};

/**
 * Valida las fechas de oferta
 * @param {string} saleStartDate - Fecha de inicio de oferta
 * @param {string} saleEndDate - Fecha de fin de oferta
 * @returns {{isValid: boolean, error: string|null}}
 */
export const validateSaleDates = (saleStartDate, saleEndDate) => {
  if (!saleStartDate || !saleEndDate) {
    return { isValid: false, error: 'Las fechas de inicio y fin de oferta son requeridas' };
  }

  const startDate = new Date(saleStartDate);
  const endDate = new Date(saleEndDate);

  if (isNaN(startDate.getTime())) {
    return { isValid: false, error: 'Fecha de inicio de oferta inválida' };
  }

  if (isNaN(endDate.getTime())) {
    return { isValid: false, error: 'Fecha de fin de oferta inválida' };
  }

  if (startDate >= endDate) {
    return { isValid: false, error: 'La fecha de fin de oferta debe ser posterior a la fecha de inicio' };
  }

  return { isValid: true, error: null };
};

/**
 * Valida que el producto existe y está activo (sin validar stock)
 * @param {string|number} productId - ID del producto
 * @returns {Promise<{isValid: boolean, product: object|null, error: string|null}>}
 */
export const validateProductExists = async (productId) => {
  const idValidation = validateProductId(productId);
  if (!idValidation.isValid) {
    return {
      isValid: false,
      product: null,
      error: idValidation.error
    };
  }

  const product = await productService.findById(idValidation.id);
  
  if (!product) {
    return {
      isValid: false,
      product: null,
      error: 'Producto no encontrado'
    };
  }

  if (!product.is_active) {
    return {
      isValid: false,
      product,
      error: 'El producto no está disponible'
    };
  }

  return {
    isValid: true,
    product,
    error: null
  };
};

// ============================================
// VALIDADORES DE CARRITO
// ============================================

/**
 * Valida los datos básicos para agregar/actualizar item en carrito
 * @param {object} data - Datos a validar
 * @param {number} data.productId - ID del producto
 * @param {number} data.quantity - Cantidad
 * @returns {{isValid: boolean, error: string|null}}
 */
export const validateCartItemData = (data) => {
  const { productId, quantity } = data;

  const idValidation = validateProductId(productId);
  if (!idValidation.isValid) {
    return { isValid: false, error: idValidation.error };
  }

  const quantityValidation = validatePositiveNumber(quantity, 'Cantidad');
  if (!quantityValidation.isValid) {
    return { isValid: false, error: quantityValidation.error };
  }

  return { isValid: true, error: null };
};

/**
 * Valida que el producto existe, está activo y tiene stock suficiente
 * Considera la cantidad ya presente en el carrito
 * @param {string|number} productId - ID del producto
 * @param {number} requestedQuantity - Cantidad solicitada
 * @param {object} cart - Objeto del carrito (opcional, para verificar cantidad existente)
 * @returns {Promise<{isValid: boolean, product: object|null, error: string|null, availableStock: number}>}
 */
export const validateProductForCart = async (productId, requestedQuantity, cart = null) => {
  // Validar que productId y quantity sean válidos
  const idValidation = validateProductId(productId);
  if (!idValidation.isValid) {
    return {
      isValid: false,
      product: null,
      error: idValidation.error,
      availableStock: 0
    };
  }

  const quantityValidation = validatePositiveNumber(requestedQuantity, 'Cantidad');
  if (!quantityValidation.isValid) {
    return {
      isValid: false,
      product: null,
      error: quantityValidation.error,
      availableStock: 0
    };
  }

  const productIdValue = idValidation.id;
  const quantityInt = quantityValidation.value;

  // Buscar producto
  const product = await productService.findById(productIdValue);
  
  if (!product) {
    return {
      isValid: false,
      product: null,
      error: 'Producto no encontrado',
      availableStock: 0
    };
  }

  // Validar que el producto esté activo
  if (!product.is_active) {
    return {
      isValid: false,
      product,
      error: 'El producto no está disponible',
      availableStock: product.stock || 0
    };
  }

  // Verificar cantidad ya en el carrito (si existe)
  let quantityInCart = 0;
  if (cart && cart.cart_items) {
    const existingItem = cart.cart_items.find(item => item.product_id === productIdValue);
    if (existingItem) {
      quantityInCart = existingItem.quantity;
    }
  }

  // Calcular stock disponible (stock total - cantidad en carrito)
  const availableStock = product.stock - quantityInCart;

  // Validar que haya stock suficiente
  if (availableStock < quantityInt) {
    const stockMessage = availableStock <= 0
      ? 'Producto agotado.'
      : `Stock insuficiente. Solo hay ${availableStock} unidades disponibles.`;

    return {
      isValid: false,
      product,
      error: `${stockMessage}${quantityInCart > 0 ? ` (ya tienes ${quantityInCart} en el carrito)` : ''}`,
      availableStock
    };
  }

  return {
    isValid: true,
    product,
    error: null,
    availableStock: product.stock
  };
};

// ============================================
// VALIDADORES DE ÓRDENES (Para futuro)
// ============================================

/**
 * Valida el ID de una orden
 * @param {string|number} id - ID a validar
 * @returns {{isValid: boolean, orderId: number|null, error: string|null}}
 */
export const validateOrderId = (id) => {
  return validateId(id, 'ID de orden');
};

// ============================================
// VALIDADORES DE USUARIOS
// ============================================

/**
 * Valida el ID de un usuario (acepta números enteros o UUIDs/strings)
 * @param {string|number} id - ID a validar
 * @returns {{isValid: boolean, id: string|number|null, error: string|null}}
 */
export const validateUserId = (id) => {
  if (!id) {
    return { isValid: false, id: null, error: 'ID de usuario requerido' };
  }
  
  // Convert to string for validation
  const idStr = String(id).trim();
  
  if (idStr === '') {
    return { isValid: false, id: null, error: 'ID de usuario inválido' };
  }
  
  // Try to validate as integer first (for backward compatibility)
  const idInt = parseInt(idStr);
  if (!isNaN(idInt) && idInt > 0) {
    return { isValid: true, id: idInt, error: null };
  }
  
  // If not a valid integer, accept as string (for UUIDs and other string IDs)
  // UUID format: 8-4-4-4-12 hexadecimal characters
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(idStr)) {
    return { isValid: true, id: idStr, error: null };
  }
  
  // Accept any non-empty string (for other ID formats)
  if (idStr.length > 0) {
    return { isValid: true, id: idStr, error: null };
  }
  
  return { isValid: false, id: null, error: 'ID de usuario inválido' };
};

/**
 * Valida el formato de un email
 * @param {string} email - Email a validar
 * @returns {{isValid: boolean, error: string|null}}
 */
export const validateEmail = (email) => {
  if (!email) {
    return { isValid: false, error: 'Email requerido' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, error: 'Formato de email inválido' };
  }

  return { isValid: true, error: null };
};

// ============================================
// VALIDADORES DE ÓRDENES (Extendidos)
// ============================================

/**
 * Valida el estado de una orden
 * @param {string} status - Estado a validar
 * @returns {{isValid: boolean, error: string|null}}
 */
export const validateOrderStatus = (status) => {
  const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
  
  if (!status) {
    return { isValid: false, error: 'Estado de orden requerido' };
  }

  if (!validStatuses.includes(status)) {
    return { 
      isValid: false, 
      error: `Estado inválido. Estados válidos: ${validStatuses.join(', ')}` 
    };
  }

  return { isValid: true, error: null };
};

/**
 * Valida el estado de pago
 * @param {string} paymentStatus - Estado de pago a validar
 * @returns {{isValid: boolean, error: string|null}}
 */
export const validatePaymentStatus = (paymentStatus) => {
  const validStatuses = ['pending', 'paid', 'failed', 'refunded', 'cancelled'];
  
  if (!paymentStatus) {
    return { isValid: false, error: 'Estado de pago requerido' };
  }

  if (!validStatuses.includes(paymentStatus)) {
    return { 
      isValid: false, 
      error: `Estado de pago inválido. Estados válidos: ${validStatuses.join(', ')}` 
    };
  }

  return { isValid: true, error: null };
};

/**
 * Valida la dirección de envío
 * @param {object} address - Dirección a validar
 * @returns {{isValid: boolean, error: string|null, missingFields: string[]}}
 */
export const validateShippingAddress = (address) => {
  if (!address || typeof address !== 'object') {
    return { 
      isValid: false, 
      error: 'Dirección de envío requerida',
      missingFields: ['street', 'city', 'state', 'zipCode', 'country']
    };
  }

  const requiredFields = ['street', 'city', 'state', 'zipCode', 'country'];
  const missingFields = requiredFields.filter(field => {
    const value = address[field];
    // Check if field is missing, null, or undefined
    if (value === null || value === undefined || value === '') {
      return true;
    }
    // Convert to string and check if it's empty after trimming
    const stringValue = String(value).trim();
    return stringValue === '';
  });

  if (missingFields.length > 0) {
    return {
      isValid: false,
      error: `La dirección de envío es requerida con todos los campos. Faltan: ${missingFields.join(', ')}`,
      missingFields
    };
  }

  return { isValid: true, error: null, missingFields: [] };
};

