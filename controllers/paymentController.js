import { transbankService } from '../utils/transbankService.js';
import { orderService } from '../models/orderModel.js';
import { createOrderFromCart } from './orderController.js';
import { supabase, supabaseAdmin } from '../database.js';
import logger from '../utils/logger.js';
import { requireAuth } from '../utils/authHelper.js';
import { successResponse, errorResponse, notFoundResponse, serverErrorResponse } from '../utils/responseHelper.js';
import { isStarkenConfigured } from '../utils/starkenService.js';
import { sendPaymentConfirmationEmail, sendPaymentFailedEmail, sendPaymentNotificationToAdmin } from '../utils/mailer.js';
import { releaseStockForOrder } from '../utils/stockHelper.js';

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

    if (!isStarkenConfigured()) {
      return errorResponse(
        res,
        'Cotización de envío no disponible en el servidor. Configura las variables Starken.',
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
      error.message.includes('costo de envío')
    ) {
      errorMessage = error.message;
      return errorResponse(res, errorMessage, 400);
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
      paymentStatus: order.payment_status
    };

    if (order.transbank_token) {
      const transbankStatus = await transbankService.getTransactionStatus(order.transbank_token);
      responseData.transbankStatus = transbankStatus.status;
      responseData.amount = transbankStatus.amount;
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

    if (!order.transbank_token) {
      return errorResponse(res, 'Esta orden no tiene una transacción de Transbank.', 400);
    }

    const refundAmount = amount || order.total_amount;
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
      refundResponse
    });

  } catch (error) {
    logger.error('Error refunding payment:', { message: error.message });
    return serverErrorResponse(res, error, 'Error al anular el pago');
  }
};
