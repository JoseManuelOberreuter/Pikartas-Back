import { orderService } from '../models/orderModel.js';
import { transbankService } from '../utils/transbankService.js';
import { cartService } from '../models/cartModel.js';
import { productService } from '../models/productModel.js';
import { userService } from '../models/userModel.js';
import logger from '../utils/logger.js';
import { requireAuth, requireAdmin, requireOwnershipOrAdmin } from '../utils/authHelper.js';
import { successResponse, errorResponse, notFoundResponse, forbiddenResponse, serverErrorResponse } from '../utils/responseHelper.js';
import { formatOrder, formatPagination } from '../utils/formatters.js';
import { parsePaginationParams, calculatePagination } from '../utils/paginationHelper.js';
import { validateShippingAddress, validateOrderStatus, validateOrderId } from '../utils/validators.js';
import { calculateOrderStats, calculateDateRange } from '../utils/statsHelper.js';
import { reserveStockForOrder, validateStockForCart, releaseStockForOrder } from '../utils/stockHelper.js';
import { sendPaymentFailedEmail, sendOrderProcessingEmail, sendOrderShippedEmail, sendOrderDeliveredEmail } from '../utils/mailer.js';
import { isStarkenConfigured, quoteDomicilio } from '../utils/starkenService.js';
import { isStarkenShippingMode } from '../utils/shippingMode.js';
import { estimateShippingCost } from '../utils/estimatedShipping.js';
import {
  computeCheckoutTotals,
  shippingMatchesClient
} from '../utils/shippingPricing.js';

/**
 * @param {object} [pricing]
 * @param {number} [pricing.codigoCiudadDestino] - requerido (Starken o destino estimado)
 * @param {number} [pricing.clientShippingAmount] - envío mostrado al usuario (tras regla gratis)
 * @param {number} [pricing.kilos]
 * @param {number} [pricing.alto]
 * @param {number} [pricing.ancho]
 * @param {number} [pricing.largo]
 */
export const createOrderFromCart = async (userId, shippingAddress, notes = null, pricing = {}) => {
  // Validate shipping address
  const addressValidation = validateShippingAddress(shippingAddress);
  if (!addressValidation.isValid) {
    throw new Error(addressValidation.error);
  }

  // Get user cart
  const cart = await cartService.findByUserId(userId);
  if (!cart || !cart.cart_items || cart.cart_items.length === 0) {
    throw new Error('El carrito está vacío. Agrega productos antes de crear una orden.');
  }

  // Validate stock before creating order
  const stockValidation = await validateStockForCart(cart.cart_items);
  if (!stockValidation.isValid) {
    throw new Error(stockValidation.error);
  }

  const subtotal = cart.cart_items.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  );

  let totalAmount = subtotal;
  let taxAmount = null;
  let shippingAmount = null;
  let starkenCodigoCiudadDestino = null;

  const dest = pricing.codigoCiudadDestino;
  if (dest === undefined || dest === null || Number.isNaN(parseInt(dest, 10))) {
    throw new Error('Selecciona una ciudad de destino para calcular el envío.');
  }
  starkenCodigoCiudadDestino = parseInt(dest, 10);

  if (isStarkenShippingMode()) {
    if (!isStarkenConfigured()) {
      throw new Error(
        'El servidor no tiene configurada la cotización de envío (Starken). Contacta al administrador.'
      );
    }
    const overrides = {};
    if (pricing.kilos !== undefined && pricing.kilos !== '') overrides.kilos = parseFloat(pricing.kilos);
    if (pricing.alto !== undefined && pricing.alto !== '') overrides.alto = parseFloat(pricing.alto);
    if (pricing.ancho !== undefined && pricing.ancho !== '') overrides.ancho = parseFloat(pricing.ancho);
    if (pricing.largo !== undefined && pricing.largo !== '') overrides.largo = parseFloat(pricing.largo);

    const quote = await quoteDomicilio(starkenCodigoCiudadDestino, overrides);
    const totals = computeCheckoutTotals(subtotal, quote.shippingCost);
    taxAmount = totals.taxAmount;
    shippingAmount = totals.shippingAmount;
    totalAmount = totals.totalAmount;
  } else {
    const quoted = estimateShippingCost(starkenCodigoCiudadDestino);
    const totals = computeCheckoutTotals(subtotal, quoted);
    taxAmount = totals.taxAmount;
    shippingAmount = totals.shippingAmount;
    totalAmount = totals.totalAmount;
  }

  if (!shippingMatchesClient(pricing.clientShippingAmount, shippingAmount)) {
    throw new Error(
      'El costo de envío cambió respecto a la cotización. Actualiza el checkout e intenta de nuevo.'
    );
  }

  let order = null;
  try {
    // Create order
    order = await orderService.create({
      userId,
      totalAmount,
      taxAmount,
      shippingAmount,
      starkenCodigoCiudadDestino,
      shippingAddress,
      paymentMethod: 'webpay',
      paymentStatus: 'pending',
      status: 'pending',
      notes
    });

    // Create order items
    const orderItems = cart.cart_items.map(item => ({
      productId: item.product_id,
      productName: item.products?.name || '',
      quantity: item.quantity,
      price: item.price
    }));

    await orderService.createOrderItems(order.id, orderItems);

    // Reserve stock for the order
    await reserveStockForOrder(order.id);

    // Clear cart
    await cartService.clearCart(cart.id);

    return order;
  } catch (error) {
    // If stock reservation fails, try to clean up the order
    if (order && order.id) {
      try {
        logger.warn(`Limpiando orden ${order.id} después de error en reserva de stock`);
        await orderService.updateStatus(order.id, 'cancelled');
        await orderService.updatePaymentStatus(order.id, 'failed');
      } catch (cleanupError) {
        logger.error(`Error limpiando orden ${order.id}:`, { message: cleanupError.message });
      }
    }
    throw error;
  }
};

// Create new order
export const createOrder = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;

    const { shippingAddress, notes, codigoCiudadDestino, clientShippingAmount, kilos, alto, ancho, largo } = req.body;

    const order = await createOrderFromCart(req.user.id, shippingAddress, notes, {
      codigoCiudadDestino,
      clientShippingAmount,
      kilos,
      alto,
      ancho,
      largo
    });

    const formattedOrder = formatOrder(order, false);
    return successResponse(res, formattedOrder, 'Orden creada exitosamente', 201);

  } catch (error) {
    logger.error('Error creating order:', { message: error.message });
    const msg = error.message || '';
    if (
      msg.includes('carrito está vacío') ||
      msg.includes('Selecciona una ciudad') ||
      msg.includes('costo de envío cambió') ||
      msg.includes('Dirección de envío') ||
      msg.includes('Stock insuficiente') ||
      msg.includes('agotado')
    ) {
      return errorResponse(res, msg, 400);
    }
    if (msg.includes('Destino de envío no disponible') || msg.includes('Código de destino de envío inválido')) {
      return errorResponse(res, msg, 400);
    }
    if (msg.includes('cotización de envío') || msg.includes('Starken')) {
      return errorResponse(res, msg, 503);
    }
    return serverErrorResponse(res, error, error.message || 'Error al crear la orden');
  }
};

// Get user orders
export const getUserOrders = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;

    const { status, paymentStatus } = req.query;
    const { page, limit, offset } = parsePaginationParams(req.query);

    let orders = await orderService.findByUserId(req.user.id);

    // Filter by status if specified
    if (status) {
      orders = orders.filter(order => order.status === status);
    }

    // Filter by payment status if specified
    if (paymentStatus) {
      orders = orders.filter(order => order.payment_status === paymentStatus);
    }

    // Pagination
    const totalOrders = orders.length;
    const paginatedOrders = orders.slice(offset, offset + limit);

    // Format orders (include items with product info)
    const formattedOrders = paginatedOrders.map(order => formatOrder(order, true));

    const pagination = calculatePagination(page, limit, totalOrders);

    return successResponse(res, {
        orders: formattedOrders,
      pagination
    });

  } catch (error) {
    logger.error('Error getting user orders:', { message: error.message });
    return serverErrorResponse(res, error, 'Error al obtener las órdenes');
  }
};

// Get order by ID
export const getOrderById = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;

    const { orderId } = req.params;

    // Validate order ID
    const idValidation = validateOrderId(orderId);
    if (!idValidation.isValid) {
      return errorResponse(res, idValidation.error, 400);
    }

    const order = await orderService.findById(idValidation.id);
    if (!order) {
      return notFoundResponse(res, 'Orden');
    }

    // Verify that the order belongs to the user (unless admin)
    if (!requireOwnershipOrAdmin(req, res, order.user_id)) {
      return;
    }

    // Get Transbank status if token exists
    let transbankStatus = null;
    if (order.transbank_token) {
      try {
        const transbankResponse = await transbankService.getTransactionStatus(order.transbank_token);
        transbankStatus = transbankResponse.status;
      } catch (error) {
        logger.warn('No se pudo obtener estado de Transbank:', { message: error.message });
      }
    }

    const formattedOrder = formatOrder(order, true);
    if (transbankStatus) {
      formattedOrder.transbankStatus = transbankStatus;
    }

    return successResponse(res, formattedOrder);

  } catch (error) {
    logger.error('Error getting order by ID:', { message: error.message });
    return serverErrorResponse(res, error, 'Error al obtener la orden');
  }
};

// Cancel order
export const cancelOrder = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;

    const { orderId } = req.params;
    const { reason } = req.body;

    // Validate order ID
    const idValidation = validateOrderId(orderId);
    if (!idValidation.isValid) {
      return errorResponse(res, idValidation.error, 400);
    }

    const order = await orderService.findById(idValidation.id);
    if (!order) {
      return notFoundResponse(res, 'Orden');
    }

    // Verify that the order belongs to the user
    if (order.user_id !== req.user.id) {
      return forbiddenResponse(res, 'No tienes permisos para cancelar esta orden.');
    }

    // Verify that the order can be cancelled
    if (order.status === 'cancelled') {
      return errorResponse(res, 'Esta orden ya está cancelada.', 400);
    }

    if (order.status === 'shipped' || order.status === 'delivered') {
      return errorResponse(res, 'No se puede cancelar una orden que ya ha sido enviada o entregada.', 400);
    }

    // If order has processed payment, try refund
    if (order.payment_status === 'paid' && order.transbank_token) {
      try {
        await transbankService.refundTransaction(order.transbank_token, order.total_amount);
        await orderService.updatePaymentStatus(order.id, 'refunded');
      } catch (error) {
        logger.error('Error processing refund:', { message: error.message });
        return serverErrorResponse(res, error, 'Error al procesar el reembolso');
      }
    }

    // Release reserved stock if order is in pending or processing status
    // (Stock was already permanently deducted if payment was confirmed)
    if (['pending', 'processing'].includes(order.status)) {
      try {
        await releaseStockForOrder(order.id);
        logger.info(`Stock liberado para orden cancelada ${order.id}`);
      } catch (error) {
        // Log error but continue with cancellation
        logger.error(`Error liberando stock para orden ${order.id}:`, { message: error.message });
      }
    }

    // Update order status
    await orderService.updateStatus(order.id, 'cancelled');

    // Send payment failed email to customer
    try {
      const user = await userService.findById(order.user_id);
      if (user && user.email) {
        await sendPaymentFailedEmail(
          user.email,
          order.order_number,
          order.id
        );
        logger.info('Payment failed email sent successfully for cancelled order', {
          orderId: order.id,
          orderNumber: order.order_number,
          email: user.email
        });
      } else {
        logger.warn('User email not found for cancelled order, skipping email notification', {
          orderId: order.id,
          userId: order.user_id
        });
      }
    } catch (emailError) {
      // Log error but don't fail the cancellation process
      logger.error('Error sending payment failed email for cancelled order:', {
        message: emailError.message,
        orderId: order.id,
        orderNumber: order.order_number,
        error: emailError
      });
    }

    return successResponse(res, {
        orderId: order.id,
        orderNumber: order.order_number,
        status: 'cancelled',
        refundProcessed: order.payment_status === 'paid'
    }, 'Orden cancelada exitosamente');

  } catch (error) {
    logger.error('Error cancelling order:', { message: error.message });
    return serverErrorResponse(res, error, 'Error al cancelar la orden');
  }
};

// Get all orders (Admin)
export const getAllOrders = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { status, paymentStatus, userId, search } = req.query;
    const { page, limit, offset } = parsePaginationParams(req.query);

    let orders = await orderService.findAll();

    // Filter by status if specified
    if (status) {
      orders = orders.filter(order => order.status === status);
    }

    // Filter by payment status if specified
    if (paymentStatus) {
      orders = orders.filter(order => order.payment_status === paymentStatus);
    }

    // Filter by user if specified
    if (userId) {
      orders = orders.filter(order => order.user_id === parseInt(userId));
    }

    // Search filter - search in order number, order ID, user email, user name
    if (search) {
      const searchLower = search.toLowerCase();
      orders = orders.filter(order => {
        const orderNumber = order.order_number?.toLowerCase() || '';
        const orderId = order.id?.toString().toLowerCase() || '';
        const userIdStr = order.user_id?.toString().toLowerCase() || '';
        const userEmail = order.users?.email?.toLowerCase() || '';
        const userName = order.users?.name?.toLowerCase() || '';
        
        return orderNumber.includes(searchLower) || 
               orderId.includes(searchLower) ||
               userIdStr.includes(searchLower) ||
               userEmail.includes(searchLower) ||
               userName.includes(searchLower);
      });
    }

    // Pagination
    const totalOrders = orders.length;
    const paginatedOrders = orders.slice(offset, offset + limit);

    // Format orders (include items for admin view)
    const formattedOrders = paginatedOrders.map(order => formatOrder(order, true));

    const pagination = calculatePagination(page, limit, totalOrders);

    return successResponse(res, {
        orders: formattedOrders,
      pagination
    });

  } catch (error) {
    logger.error('Error getting all orders:', { message: error.message });
    return serverErrorResponse(res, error, 'Error al obtener las órdenes');
  }
};

// Update order status (Admin)
export const updateOrderStatus = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { orderId } = req.params;
    const { status, notes } = req.body;

    // Validate order ID
    const idValidation = validateOrderId(orderId);
    if (!idValidation.isValid) {
      return errorResponse(res, idValidation.error, 400);
    }

    // Validate order status
    const statusValidation = validateOrderStatus(status);
    if (!statusValidation.isValid) {
      return errorResponse(res, statusValidation.error, 400);
    }

    const order = await orderService.findById(idValidation.id);
    if (!order) {
      return notFoundResponse(res, 'Orden');
    }

    // Get user information for email notifications
    let userEmail = null;
    let userName = null;
    try {
      const user = await userService.findById(order.user_id);
      if (user) {
        userEmail = user.email;
        userName = user.name;
      }
    } catch (error) {
      logger.warn(`Could not fetch user info for order ${order.id}:`, { message: error.message });
    }

    // Update status
    const updatedOrder = await orderService.updateStatus(idValidation.id, status);

    // If notes are provided, update them too
    if (notes) {
      await orderService.updateNotes(idValidation.id, notes);
    }

    // Send email notifications based on new status
    if (userEmail) {
      try {
        if (status === 'processing') {
          await sendOrderProcessingEmail(
            userEmail,
            updatedOrder.order_number,
            updatedOrder.id,
            userName
          );
          logger.info('Order processing email sent successfully', {
            orderId: updatedOrder.id,
            orderNumber: updatedOrder.order_number,
            email: userEmail
          });
        } else if (status === 'shipped') {
          await sendOrderShippedEmail(
            userEmail,
            updatedOrder.order_number,
            updatedOrder.id,
            userName
          );
          logger.info('Order shipped email sent successfully', {
            orderId: updatedOrder.id,
            orderNumber: updatedOrder.order_number,
            email: userEmail
          });
        } else if (status === 'delivered') {
          await sendOrderDeliveredEmail(
            userEmail,
            updatedOrder.order_number,
            updatedOrder.id,
            userName
          );
          logger.info('Order delivered email sent successfully', {
            orderId: updatedOrder.id,
            orderNumber: updatedOrder.order_number,
            email: userEmail
          });
        }
      } catch (emailError) {
        // Log error but don't fail the status update
        logger.error('Error sending order status email:', {
          message: emailError.message,
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.order_number,
          status,
          error: emailError
        });
      }
    } else {
      logger.warn('User email not found for order, skipping status email notification', {
        orderId: updatedOrder.id,
        userId: order.user_id
      });
    }

    return successResponse(res, {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.order_number,
        status: updatedOrder.status,
        updatedAt: updatedOrder.updated_at
    }, 'Estado de orden actualizado exitosamente');

  } catch (error) {
    logger.error('Error updating order status:', { message: error.message });
    return serverErrorResponse(res, error, 'Error al actualizar el estado de la orden');
  }
};

// Get order statistics (Admin)
export const getOrderStats = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { period = 'all' } = req.query;
    
    // Calculate date range
    const { start, end } = calculateDateRange(period);

    const orders = await orderService.findAll();
    const filteredOrders = orders.filter(order => {
      const orderDate = new Date(order.created_at);
      return orderDate >= start && orderDate <= end;
    });

    // Calculate statistics
    const stats = calculateOrderStats(filteredOrders, period);

    return successResponse(res, {
      ...stats,
        dateRange: {
        start: start.toISOString(),
        end: end.toISOString()
      }
    });

  } catch (error) {
    logger.error('Error getting order stats:', { message: error.message });
    return serverErrorResponse(res, error, 'Error al obtener las estadísticas');
  }
};

// Create test order for development
export const createTestOrder = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;

    // Get some products to create test order
    const products = await productService.findActive();
    if (!products || products.length === 0) {
      return errorResponse(res, 'No hay productos disponibles para crear una orden de prueba.', 400);
    }

    // Take first 2-3 products for test order
    const testProducts = products.slice(0, Math.min(3, products.length));
    const totalAmount = testProducts.reduce((sum, product) => sum + product.price, 0);

    // Create test order
    const order = await orderService.create({
      userId: req.user.id,
      totalAmount,
      shippingAddress: {
        street: 'Av. Desarrollo 123',
        city: 'Santiago',
        state: 'Metropolitana',
        zipCode: '7500000',
        country: 'Chile'
      },
      paymentMethod: 'webpay',
      paymentStatus: 'paid', // Simulate successful payment
      status: 'confirmed', // Simulate confirmed order
      notes: 'Orden de prueba creada para desarrollo'
    });

    // Create test order items
    const orderItems = testProducts.map(product => ({
      productId: product.id,
      productName: product.name,
      quantity: 1,
      price: product.price
    }));

    await orderService.createOrderItems(order.id, orderItems);

    const formattedOrder = formatOrder(order, false);
    return successResponse(res, {
      ...formattedOrder,
      itemsCount: orderItems.length
    }, 'Orden de prueba creada exitosamente', 201);

  } catch (error) {
    logger.error('Error creating test order:', { message: error.message });
    return serverErrorResponse(res, error, 'Error al crear la orden de prueba');
  }
}; 
