import { transbankService } from '../utils/transbankService.js';
import { mercadoPagoService, mapMercadoPagoStatus } from '../utils/mercadoPagoService.js';
import { orderService } from '../models/orderModel.js';
import { createOrderFromCart } from './orderController.js';
import { supabaseAdmin } from '../database.js';
import logger from '../utils/logger.js';
import { requireAuth } from '../utils/authHelper.js';
import { successResponse, errorResponse, notFoundResponse, serverErrorResponse } from '../utils/responseHelper.js';
import { isShippingConfigured } from '../utils/shippingMode.js';
import { sendPaymentConfirmationEmail, sendPaymentFailedEmail, sendPaymentNotificationToAdmin } from '../utils/mailer.js';
import { releaseStockForOrder } from '../utils/stockHelper.js';

function getBackendBaseUrl(req) {
  if (process.env.BACKEND_URL) {
    return process.env.BACKEND_URL.replace(/\/$/, '');
  }
  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL.replace(/\/$/, '');
  }
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host');
  if (host) return `${proto}://${host}`;
  return null;
}

async function loadOrderWithRelationsById(orderId) {
  if (!supabaseAdmin) {
    throw new Error('Service role key not configured');
  }
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(`
      *,
      users:user_id (id, email, name),
      order_items (
        id,
        product_id,
        product_name,
        quantity,
        price,
        subtotal
      )
    `)
    .eq('id', orderId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Applies Mercado Pago payment result to an order (idempotent for already-paid).
 */
async function applyMercadoPagoPaymentResult(order, payment) {
  const mpStatus = payment.status;
  const paymentStatus = mapMercadoPagoStatus(mpStatus);
  const paymentId = payment.id != null ? String(payment.id) : null;

  await orderService.updateMercadoPagoPayment(order.id, {
    paymentId,
    mpStatus
  });

  // Idempotency: do not re-send emails / re-release stock if already finalized
  if (order.payment_status === 'paid' && paymentStatus === 'paid') {
    logger.info('Mercado Pago payment already processed (paid)', {
      orderId: order.id,
      paymentId
    });
    return { paymentStatus, mpStatus, alreadyProcessed: true };
  }

  if (order.payment_status === 'failed' && paymentStatus === 'failed') {
    return { paymentStatus, mpStatus, alreadyProcessed: true };
  }

  await orderService.updatePaymentStatus(order.id, paymentStatus);

  if (paymentStatus === 'paid') {
    await orderService.updateStatus(order.id, 'confirmed');

    try {
      const userEmail = order.users?.email;
      if (userEmail) {
        await sendPaymentConfirmationEmail(
          userEmail,
          order.order_number,
          order.id,
          order.total_amount || payment.transaction_amount || 0,
          paymentId,
          'paid'
        );
      }
    } catch (emailError) {
      logger.error('Error sending MP payment confirmation email:', {
        message: emailError.message,
        orderId: order.id
      });
    }

    try {
      await sendPaymentNotificationToAdmin(
        order.order_number,
        order.id,
        order.users?.name || 'Cliente',
        order.users?.email || 'N/A',
        order.total_amount || payment.transaction_amount || 0,
        paymentId
      );
    } catch (adminEmailError) {
      logger.error('Error sending MP admin payment notification:', {
        message: adminEmailError.message,
        orderId: order.id
      });
    }
  } else if (paymentStatus === 'failed' || paymentStatus === 'refunded') {
    if (paymentStatus === 'failed' && order.status !== 'cancelled') {
      try {
        await releaseStockForOrder(order.id);
      } catch (stockError) {
        logger.error(`Error liberando stock para orden ${order.id}:`, {
          message: stockError.message
        });
      }
      await orderService.updateStatus(order.id, 'cancelled');
    }

    if (paymentStatus === 'failed') {
      try {
        const userEmail = order.users?.email;
        if (userEmail) {
          await sendPaymentFailedEmail(userEmail, order.order_number, order.id);
        }
      } catch (emailError) {
        logger.error('Error sending MP payment failed email:', {
          message: emailError.message,
          orderId: order.id
        });
      }
    }

    if (paymentStatus === 'refunded') {
      await orderService.updateStatus(order.id, 'cancelled');
    }
  }

  return { paymentStatus, mpStatus, alreadyProcessed: false };
}

// Initiate payment process
export const initiatePayment = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;

    const {
      shippingAddress,
      notes,
      codigoCiudadDestino,
      clientShippingAmount,
      kilos,
      alto,
      ancho,
      largo
    } = req.body;

    logger.info('Initiating payment process:', {
      userId: req.user.id,
      hasShippingAddress: !!shippingAddress
    });

    if (!isShippingConfigured()) {
      return errorResponse(
        res,
        'Cotización de envío no disponible en el servidor. Configura SHIPPING_PROVIDER=estimated o credenciales Starken con SHIPPING_PROVIDER=starken.',
        503
      );
    }

    // Create order using shared function
    const order = await createOrderFromCart(req.user.id, shippingAddress, notes || null, {
      codigoCiudadDestino,
      clientShippingAmount,
      kilos,
      alto,
      ancho,
      largo
    });

    logger.info('Order created for payment:', {
      orderId: order.id,
      orderNumber: order.order_number,
      totalAmount: order.total_amount
    });

    // Create Transbank transaction
    const sessionId = `session_${req.user.id}_${Date.now()}`;
    
    // Validate that FRONTEND_URL is configured
    if (!process.env.FRONTEND_URL) {
      logger.error('FRONTEND_URL environment variable not configured');
      return serverErrorResponse(res, new Error('FRONTEND_URL no está configurado'), 'Error de configuración: FRONTEND_URL no está configurado');
    }
    
    const returnUrl = `${process.env.FRONTEND_URL}/payment/return`;
    
    logger.info('Initiating Transbank transaction:', {
      orderId: order.id,
      orderNumber: order.order_number,
      amount: order.total_amount,
      sessionId,
      returnUrl: returnUrl.substring(0, 50) + '...'
    });
    
    const transbankResponse = await transbankService.createTransaction(
      order.total_amount,
      order.order_number,
      sessionId,
      returnUrl
    );

    // Update order with Transbank token
    await orderService.updateTransbankToken(order.id, transbankResponse.token);

    // Build full URL with token
    const fullTransbankUrl = `${transbankResponse.url}?token_ws=${transbankResponse.token}`;

    logger.info('Payment initiation successful:', {
      orderId: order.id,
      orderNumber: order.order_number,
      amount: order.total_amount
    });

    return successResponse(res, {
      orderId: order.id,
      orderNumber: order.order_number,
      amount: order.total_amount,
      transbankUrl: fullTransbankUrl,
      transbankToken: transbankResponse.token
    });

  } catch (error) {
    // Enhanced error logging with more context
    logger.error('Error initiating payment:', {
      message: error.message,
      stack: error.stack,
      userId: req.user?.id,
      hasShippingAddress: !!req.body?.shippingAddress,
      errorType: error.constructor?.name,
      transbankError: error.response?.data || error.response?.statusText,
      statusCode: error.response?.status
    });
    
    // Provide more specific error messages based on error type
    let errorMessage = 'Error al procesar el pago';
    
    if (error.message.includes('carrito está vacío')) {
      errorMessage = error.message;
    } else if (
      error.message.includes('ciudad de destino') ||
      error.message.includes('costo de envío cambió') ||
      error.message.includes('costo de envío') ||
      error.message.includes('Stock insuficiente') ||
      error.message.includes('agotado')
    ) {
      errorMessage = error.message;
      return errorResponse(res, errorMessage, 400);
    } else if (
      error.message.includes('Destino de envío no disponible') ||
      error.message.includes('Código de destino de envío inválido')
    ) {
      return errorResponse(res, error.message, 400);
    } else if (error.message.includes('cotización de envío') || error.message.includes('Starken')) {
      return errorResponse(res, error.message, 503);
    } else if (error.message.includes('FRONTEND_URL')) {
      errorMessage = 'Error de configuración del servidor. Por favor, contacta al soporte.';
    } else if (error.message.includes('orderId') || error.message.includes('sessionId') || error.message.includes('amount')) {
      errorMessage = 'Error en los parámetros de la transacción. Por favor, intenta nuevamente.';
    } else if (error.response?.status === 500 && error.response?.data) {
      errorMessage = 'Error en el servicio de pagos. Por favor, intenta nuevamente más tarde.';
    }
    
    return serverErrorResponse(res, error, errorMessage);
  }
};

// Confirm payment (Transbank callback)
export const confirmPayment = async (req, res) => {
  try {
    const { token_ws } = req.body;

    if (!token_ws) {
      return errorResponse(res, 'Token de transacción requerido.', 400);
    }

    // Confirm transaction in Transbank
    const transbankResponse = await transbankService.confirmTransaction(token_ws);

    // Find order by token - Use supabaseAdmin to bypass RLS since this is a callback endpoint
    const { supabaseAdmin } = await import('../database.js');
    if (!supabaseAdmin) {
      logger.error('supabaseAdmin is not available - SUPABASE_SERVICE_ROLE_KEY may not be configured');
      return serverErrorResponse(res, new Error('Service role key not configured'), 'Error de configuración del servidor');
    }

    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        users:user_id (id, email, name),
        order_items (
          id,
          product_id,
          product_name,
          quantity,
          price,
          subtotal
        )
      `)
      .eq('transbank_token', token_ws)
      .single();

    if (error || !orders) {
      logger.error('Order not found by token:', { 
        token: token_ws.substring(0, 10) + '...', 
        error: error?.message 
      });
      return notFoundResponse(res, 'Orden');
    }

    // Update order status
    const paymentStatus = transbankResponse.status === 'AUTHORIZED' ? 'paid' : 'failed';
    await orderService.updatePaymentStatus(
      orders.id, 
      paymentStatus, 
      transbankResponse.status
    );

    if (transbankResponse.status === 'AUTHORIZED') {
      // Payment successful - stock already reserved, no need to do anything
      await orderService.updateStatus(orders.id, 'confirmed');

      // Send payment confirmation email to customer
      try {
        const userEmail = orders.users?.email;
        if (userEmail) {
          const amount = orders.total_amount || transbankResponse.amount || 0;
          await sendPaymentConfirmationEmail(
            userEmail,
            orders.order_number,
            orders.id,
            amount,
            transbankResponse.authorization_code,
            'paid'
          );
          logger.info('Payment confirmation email sent successfully to customer', {
            orderId: orders.id,
            orderNumber: orders.order_number,
            email: userEmail
          });
        } else {
          logger.warn('User email not found for order, skipping email notification', {
            orderId: orders.id,
            userId: orders.user_id
          });
        }
      } catch (emailError) {
        // Log error but don't fail the payment confirmation
        logger.error('Error sending payment confirmation email to customer:', {
          message: emailError.message,
          orderId: orders.id,
          orderNumber: orders.order_number,
          error: emailError
        });
      }

      // Send payment notification email to admin
      try {
        const userEmail = orders.users?.email || 'N/A';
        const userName = orders.users?.name || 'Cliente';
        const amount = orders.total_amount || transbankResponse.amount || 0;
        await sendPaymentNotificationToAdmin(
          orders.order_number,
          orders.id,
          userName,
          userEmail,
          amount,
          transbankResponse.authorization_code
        );
        logger.info('Payment notification email sent successfully to admin', {
          orderId: orders.id,
          orderNumber: orders.order_number
        });
      } catch (adminEmailError) {
        // Log error but don't fail the payment confirmation
        logger.error('Error sending payment notification email to admin:', {
          message: adminEmailError.message,
          orderId: orders.id,
          orderNumber: orders.order_number,
          error: adminEmailError
        });
      }
    } else {
      // Payment failed - release reserved stock and cancel order automatically
      try {
        await releaseStockForOrder(orders.id);
        logger.info(`Stock liberado para orden ${orders.id} después de pago fallido`);
      } catch (stockError) {
        // Log error but continue with cancellation
        logger.error(`Error liberando stock para orden ${orders.id}:`, { 
          message: stockError.message 
        });
      }

      // Cancel order automatically
      await orderService.updateStatus(orders.id, 'cancelled');
      logger.info(`Orden ${orders.id} cancelada automáticamente debido a pago fallido`);

      // Send payment failed email to customer
      try {
        const userEmail = orders.users?.email;
        if (userEmail) {
          await sendPaymentFailedEmail(
            userEmail,
            orders.order_number,
            orders.id
          );
          logger.info('Payment failed email sent successfully', {
            orderId: orders.id,
            orderNumber: orders.order_number,
            email: userEmail
          });
        } else {
          logger.warn('User email not found for order, skipping payment failed email notification', {
            orderId: orders.id,
            userId: orders.user_id
          });
        }
      } catch (emailError) {
        // Log error but don't fail the payment failure process
        logger.error('Error sending payment failed email:', {
          message: emailError.message,
          orderId: orders.id,
          orderNumber: orders.order_number,
          error: emailError
        });
      }
    }

    // Use order amount from database, fallback to transbank response amount
    const amount = orders.total_amount || transbankResponse.amount || 0;

    return successResponse(res, {
      orderId: orders.id,
      orderNumber: orders.order_number,
      status: transbankResponse.status,
      paymentStatus,
      amount: amount,
      authorizationCode: transbankResponse.authorization_code
    });

  } catch (error) {
    logger.error('Error confirming payment:', { message: error.message });
    
    // Handle different types of errors
    if (error.message.includes('aborted')) {
      return errorResponse(res, 'El pago fue cancelado o abortado por el usuario.', 400);
    } else if (error.message.includes('Invalid status')) {
      return errorResponse(res, 'La transacción no está en un estado válido para confirmar.', 400);
    } else {
      return serverErrorResponse(res, error, 'Error al confirmar el pago');
    }
  }
};

// Get payment status
export const getPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await orderService.findById(orderId);
    if (!order) {
      return notFoundResponse(res, 'Orden');
    }

    const responseData = {
      orderId: order.id,
      orderNumber: order.order_number,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method
    };

    if (order.transbank_token) {
      const transbankStatus = await transbankService.getTransactionStatus(order.transbank_token);
      responseData.transbankStatus = transbankStatus.status;
      responseData.amount = transbankStatus.amount;
    }

    if (order.mp_payment_id && mercadoPagoService.isConfigured()) {
      try {
        const payment = await mercadoPagoService.getPayment(order.mp_payment_id);
        responseData.mercadoPagoStatus = payment.status;
        responseData.amount = payment.transaction_amount ?? order.total_amount;
        responseData.mpPreferenceId = order.mp_preference_id;
        responseData.mpPaymentId = order.mp_payment_id;
      } catch (mpError) {
        logger.warn('Could not refresh Mercado Pago status:', { message: mpError.message });
        responseData.mercadoPagoStatus = order.mp_status;
        responseData.mpPreferenceId = order.mp_preference_id;
        responseData.mpPaymentId = order.mp_payment_id;
      }
    } else if (order.mp_preference_id) {
      responseData.mpPreferenceId = order.mp_preference_id;
      responseData.mercadoPagoStatus = order.mp_status;
      responseData.amount = order.total_amount;
    }

    return successResponse(res, responseData);

  } catch (error) {
    logger.error('Error getting payment status:', { message: error.message });
    return serverErrorResponse(res, error, 'Error al obtener el estado del pago');
  }
};

// Refund payment
export const refundPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { amount } = req.body;

    const order = await orderService.findById(orderId);
    if (!order) {
      return notFoundResponse(res, 'Orden');
    }

    const refundAmount = amount || order.total_amount;

    if (order.payment_method === 'mercadopago' || order.mp_payment_id) {
      if (!order.mp_payment_id) {
        return errorResponse(res, 'Esta orden no tiene un pago de Mercado Pago registrado.', 400);
      }

      const refundResponse = await mercadoPagoService.refundPayment(
        order.mp_payment_id,
        amount != null ? refundAmount : null
      );

      await orderService.updatePaymentStatus(order.id, 'refunded');
      await orderService.updateMercadoPagoPayment(order.id, { mpStatus: 'refunded' });
      await orderService.updateStatus(order.id, 'cancelled');

      return successResponse(res, {
        orderId: order.id,
        refundAmount,
        provider: 'mercadopago',
        refundResponse
      });
    }

    if (!order.transbank_token) {
      return errorResponse(res, 'Esta orden no tiene una transacción de Transbank ni de Mercado Pago.', 400);
    }

    const refundResponse = await transbankService.refundTransaction(
      order.transbank_token, 
      refundAmount
    );

    // Update order status
    await orderService.updatePaymentStatus(order.id, 'refunded');
    await orderService.updateStatus(order.id, 'cancelled');

    return successResponse(res, {
      orderId: order.id,
      refundAmount,
      provider: 'webpay',
      refundResponse
    });

  } catch (error) {
    logger.error('Error refunding payment:', { message: error.message });
    return serverErrorResponse(res, error, 'Error al anular el pago');
  }
};

/**
 * Initiate Mercado Pago Checkout Pro payment.
 * Creates the order server-side and returns preference_id + checkout URL (never creates preference on the client).
 */
export const initiateMercadoPagoPayment = async (req, res) => {
  try {
    if (!requireAuth(req, res)) return;

    if (!mercadoPagoService.isConfigured()) {
      return errorResponse(
        res,
        'Mercado Pago no está configurado en el servidor. Define MERCADOPAGO_ACCESS_TOKEN.',
        503
      );
    }

    const {
      shippingAddress,
      notes,
      codigoCiudadDestino,
      clientShippingAmount,
      kilos,
      alto,
      ancho,
      largo
    } = req.body;

    if (!isShippingConfigured()) {
      return errorResponse(
        res,
        'Cotización de envío no disponible en el servidor. Configura SHIPPING_PROVIDER=estimated o credenciales Starken con SHIPPING_PROVIDER=starken.',
        503
      );
    }

    if (!process.env.FRONTEND_URL) {
      return serverErrorResponse(
        res,
        new Error('FRONTEND_URL no está configurado'),
        'Error de configuración: FRONTEND_URL no está configurado'
      );
    }

    const order = await createOrderFromCart(req.user.id, shippingAddress, notes || null, {
      codigoCiudadDestino,
      clientShippingAmount,
      kilos,
      alto,
      ancho,
      largo,
      paymentMethod: 'mercadopago'
    });

    const fullOrder = await loadOrderWithRelationsById(order.id);
    const backendBase = getBackendBaseUrl(req);
    const notificationUrl = backendBase
      ? `${backendBase}/api/payments/mercadopago/webhook?source_news=webhooks`
      : null;

    if (!notificationUrl) {
      logger.warn('BACKEND_URL/API_BASE_URL not set; preference created without notification_url');
    }

    const frontendBase = process.env.FRONTEND_URL.replace(/\/$/, '');
    const preference = await mercadoPagoService.createPreference({
      order: fullOrder || order,
      items: fullOrder?.order_items || [],
      payer: {
        email: req.user.email,
        name: req.user.name
      },
      backUrls: {
        success: `${frontendBase}/payment/mp/return?status=success`,
        failure: `${frontendBase}/payment/mp/return?status=failure`,
        pending: `${frontendBase}/payment/mp/return?status=pending`
      },
      notificationUrl
    });

    await orderService.updateMercadoPagoPreference(order.id, preference.preferenceId);

    logger.info('Mercado Pago payment initiation successful:', {
      orderId: order.id,
      orderNumber: order.order_number,
      preferenceId: preference.preferenceId
    });

    return successResponse(res, {
      orderId: order.id,
      orderNumber: order.order_number,
      amount: order.total_amount,
      preferenceId: preference.preferenceId,
      initPoint: preference.initPoint,
      sandboxInitPoint: preference.sandboxInitPoint,
      environment: mercadoPagoService.getEnvironment()
    });
  } catch (error) {
    logger.error('Error initiating Mercado Pago payment:', {
      message: error.message,
      stack: error.stack,
      userId: req.user?.id,
      cause: error.cause
    });

    let errorMessage = 'Error al procesar el pago con Mercado Pago';
    if (error.message.includes('carrito está vacío')) {
      errorMessage = error.message;
    } else if (
      error.message.includes('ciudad de destino') ||
      error.message.includes('costo de envío') ||
      error.message.includes('Stock insuficiente') ||
      error.message.includes('agotado') ||
      error.message.includes('Destino de envío') ||
      error.message.includes('Código de destino')
    ) {
      return errorResponse(res, error.message, 400);
    } else if (error.message.includes('cotización de envío') || error.message.includes('Starken')) {
      return errorResponse(res, error.message, 503);
    } else if (error.message.includes('MERCADOPAGO_ACCESS_TOKEN')) {
      return errorResponse(res, error.message, 503);
    }

    return serverErrorResponse(res, error, errorMessage);
  }
};

/**
 * Webhook / IPN endpoint for Mercado Pago payment notifications.
 * Public (no JWT). Validates x-signature when MERCADOPAGO_WEBHOOK_SECRET is set.
 */
export const mercadoPagoWebhook = async (req, res) => {
  try {
    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];
    const dataId = req.query['data.id'] || req.body?.data?.id;

    // Only enforce signature when Mercado Pago sends x-signature (webhooks). Legacy IPN may omit it.
    if (xSignature) {
      const valid = mercadoPagoService.validateWebhookSignature({
        xSignature,
        xRequestId,
        dataId
      });
      if (!valid) {
        logger.warn('Rejected Mercado Pago webhook: invalid signature');
        return res.status(401).json({ success: false, message: 'Firma inválida' });
      }
    } else if ((process.env.MERCADOPAGO_ENVIRONMENT || 'sandbox') === 'production') {
      logger.warn('Mercado Pago webhook without x-signature in production');
    }

    const topic = req.query.topic || req.query.type || req.body?.type;
    // merchant_order notifications: acknowledge; payment updates arrive as type=payment
    if (topic && topic !== 'payment' && req.body?.type !== 'payment') {
      logger.info('Mercado Pago webhook ignored (non-payment topic)', { topic });
      return res.status(200).json({ success: true, ignored: true });
    }

    const paymentId = mercadoPagoService.extractPaymentId(req);
    if (!paymentId) {
      // MP may send a validation ping without payment id
      logger.info('Mercado Pago webhook without payment id; acknowledging');
      return res.status(200).json({ success: true });
    }

    const payment = await mercadoPagoService.getPayment(paymentId);
    const externalReference = payment.external_reference;

    let order = await orderService.findByMercadoPagoPaymentId(paymentId);
    if (!order && externalReference) {
      order = await loadOrderWithRelationsById(externalReference);
    }
    if (!order && payment.order?.id) {
      // Checkout Pro may attach merchant order; prefer external_reference
      logger.warn('Order not found by external_reference for MP payment', {
        paymentId,
        externalReference
      });
    }

    if (!order) {
      logger.error('Order not found for Mercado Pago payment', {
        paymentId,
        externalReference
      });
      // Still 200 so MP does not retry forever for unknown orders
      return res.status(200).json({ success: false, message: 'Orden no encontrada' });
    }

    const result = await applyMercadoPagoPaymentResult(order, payment);

    logger.info('Mercado Pago webhook processed', {
      orderId: order.id,
      paymentId,
      mpStatus: result.mpStatus,
      paymentStatus: result.paymentStatus,
      alreadyProcessed: result.alreadyProcessed
    });

    return res.status(200).json({
      success: true,
      orderId: order.id,
      paymentStatus: result.paymentStatus
    });
  } catch (error) {
    logger.error('Error processing Mercado Pago webhook:', {
      message: error.message,
      stack: error.stack
    });
    // Return 500 so MP retries on transient failures
    return res.status(500).json({ success: false, message: 'Error procesando notificación' });
  }
};

/**
 * Confirm / sync Mercado Pago payment after browser return (back_urls).
 * Prefer webhook as source of truth; this endpoint lets the UI refresh status.
 */
export const confirmMercadoPagoPayment = async (req, res) => {
  try {
    const { payment_id: paymentIdBody, preference_id: preferenceId, order_id: orderId } = req.body;
    const paymentId = paymentIdBody || req.query?.payment_id || req.query?.collection_id;

    if (!paymentId && !preferenceId && !orderId) {
      return errorResponse(
        res,
        'Se requiere payment_id, preference_id u order_id para confirmar el pago.',
        400
      );
    }

    let order = null;
    let payment = null;

    if (paymentId) {
      payment = await mercadoPagoService.getPayment(paymentId);
      order = await orderService.findByMercadoPagoPaymentId(paymentId);
      if (!order && payment.external_reference) {
        order = await loadOrderWithRelationsById(payment.external_reference);
      }
    }

    if (!order && preferenceId) {
      order = await orderService.findByMercadoPagoPreferenceId(preferenceId);
    }

    if (!order && orderId) {
      order = await loadOrderWithRelationsById(orderId);
    }

    if (!order) {
      return notFoundResponse(res, 'Orden');
    }

    if (!payment && order.mp_payment_id) {
      payment = await mercadoPagoService.getPayment(order.mp_payment_id);
    }

    if (!payment) {
      // User returned before webhook; status may still be pending
      return successResponse(res, {
        orderId: order.id,
        orderNumber: order.order_number,
        paymentStatus: order.payment_status,
        mpStatus: order.mp_status,
        preferenceId: order.mp_preference_id,
        amount: order.total_amount,
        pendingConfirmation: true
      });
    }

    const result = await applyMercadoPagoPaymentResult(order, payment);

    return successResponse(res, {
      orderId: order.id,
      orderNumber: order.order_number,
      paymentStatus: result.paymentStatus,
      mpStatus: result.mpStatus,
      preferenceId: order.mp_preference_id,
      paymentId: String(payment.id),
      amount: order.total_amount || payment.transaction_amount || 0
    });
  } catch (error) {
    logger.error('Error confirming Mercado Pago payment:', { message: error.message });
    return serverErrorResponse(res, error, 'Error al confirmar el pago de Mercado Pago');
  }
};
