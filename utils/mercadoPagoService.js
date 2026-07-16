import {
  MercadoPagoConfig,
  Preference,
  Payment,
  PaymentRefund,
  WebhookSignatureValidator,
  InvalidWebhookSignatureError
} from 'mercadopago';
import crypto from 'crypto';
import dotenv from 'dotenv';
import logger from './logger.js';

dotenv.config();

const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
const currencyId = process.env.MERCADOPAGO_CURRENCY_ID || 'CLP';
const environment = (process.env.MERCADOPAGO_ENVIRONMENT || 'sandbox').toLowerCase();

function ensureConfigured() {
  if (!accessToken) {
    throw new Error(
      'MERCADOPAGO_ACCESS_TOKEN no está configurado. Agrega el Access Token de prueba o producción en las variables de entorno.'
    );
  }
}

function getClient() {
  ensureConfigured();
  return new MercadoPagoConfig({
    accessToken,
    options: { timeout: 10000 }
  });
}

/**
 * Maps Mercado Pago payment.status to internal payment_status values.
 */
export function mapMercadoPagoStatus(mpStatus) {
  switch ((mpStatus || '').toLowerCase()) {
    case 'approved':
      return 'paid';
    case 'refunded':
    case 'charged_back':
      return 'refunded';
    case 'rejected':
    case 'cancelled':
      return 'failed';
    case 'pending':
    case 'in_process':
    case 'in_mediation':
    case 'authorized':
    default:
      return 'pending';
  }
}

/**
 * Builds Checkout Pro preference body from an order + items.
 */
function buildPreferenceBody({ order, items, payer, backUrls, notificationUrl }) {
  const formatPrice = (value) =>
    currencyId === 'CLP' ? Math.round(Number(value)) : Number(Number(value).toFixed(2));

  const preferenceItems = (items || []).map((item) => ({
    id: String(item.product_id || item.productId || item.id || ''),
    title: String(item.product_name || item.productName || item.title || 'Producto').slice(0, 256),
    quantity: Number(item.quantity) || 1,
    unit_price: formatPrice(item.price),
    currency_id: currencyId
  }));

  if (Number(order.shipping_amount) > 0) {
    preferenceItems.push({
      id: 'shipping',
      title: 'Envío',
      quantity: 1,
      unit_price: formatPrice(order.shipping_amount),
      currency_id: currencyId
    });
  }

  if (Number(order.tax_amount) > 0) {
    preferenceItems.push({
      id: 'tax',
      title: 'Impuestos',
      quantity: 1,
      unit_price: formatPrice(order.tax_amount),
      currency_id: currencyId
    });
  }

  // Fallback: single line with order total when there are no product lines
  if (preferenceItems.length === 0) {
    preferenceItems.push({
      id: String(order.id),
      title: `Pedido ${order.order_number}`,
      quantity: 1,
      unit_price: formatPrice(order.total_amount),
      currency_id: currencyId
    });
  }

  const body = {
    items: preferenceItems,
    external_reference: String(order.id),
    metadata: {
      order_id: order.id,
      order_number: order.order_number
    },
    back_urls: backUrls,
    auto_return: 'approved',
    binary_mode: false,
    statement_descriptor: (process.env.MERCADOPAGO_STATEMENT_DESCRIPTOR || 'PIKARTAS').slice(0, 22)
  };

  if (notificationUrl) {
    body.notification_url = notificationUrl;
  }

  if (payer?.email) {
    body.payer = {
      email: payer.email,
      name: payer.name || undefined
    };
  }

  return body;
}

export const mercadoPagoService = {
  isConfigured() {
    return Boolean(accessToken);
  },

  getEnvironment() {
    return environment;
  },

  /**
   * Creates a Checkout Pro preference. preference_id is created only on the backend.
   */
  async createPreference({ order, items, payer, backUrls, notificationUrl }) {
    try {
      const client = getClient();
      const preference = new Preference(client);
      const body = buildPreferenceBody({ order, items, payer, backUrls, notificationUrl });

      logger.info('Creating Mercado Pago preference:', {
        orderId: order.id,
        orderNumber: order.order_number,
        itemCount: body.items.length,
        hasNotificationUrl: !!notificationUrl
      });

      const response = await preference.create({ body });

      if (!response?.id) {
        throw new Error('Respuesta inválida de Mercado Pago: falta preference_id');
      }

      const checkoutUrl =
        environment === 'production'
          ? response.init_point
          : response.sandbox_init_point || response.init_point;

      if (!checkoutUrl) {
        throw new Error('Respuesta inválida de Mercado Pago: falta URL de checkout');
      }

      logger.info('Mercado Pago preference created:', {
        preferenceId: response.id,
        orderId: order.id
      });

      return {
        preferenceId: String(response.id),
        initPoint: checkoutUrl,
        sandboxInitPoint: response.sandbox_init_point || null,
        raw: response
      };
    } catch (error) {
      logger.error('Error creating Mercado Pago preference:', {
        message: error.message,
        orderId: order?.id,
        status: error.status || error.response?.status,
        cause: error.cause || error.response?.data
      });
      throw error;
    }
  },

  async getPayment(paymentId) {
    try {
      const client = getClient();
      const payment = new Payment(client);
      const response = await payment.get({ id: String(paymentId) });
      return response;
    } catch (error) {
      logger.error('Error getting Mercado Pago payment:', {
        message: error.message,
        paymentId
      });
      throw error;
    }
  },

  async refundPayment(paymentId, amount = null) {
    try {
      const client = getClient();
      const refund = new PaymentRefund(client);
      if (amount == null) {
        return await refund.total({ payment_id: String(paymentId) });
      }
      return await refund.create({
        payment_id: String(paymentId),
        body: { amount: Number(amount) }
      });
    } catch (error) {
      logger.error('Error refunding Mercado Pago payment:', {
        message: error.message,
        paymentId,
        amount
      });
      throw error;
    }
  },

  /**
   * Validates webhook authenticity using SDK WebhookSignatureValidator when secret is set.
   * Falls back to manual HMAC if needed. Returns false when secret is configured and check fails.
   * When secret is not configured (local/dev), logs a warning and returns true.
   */
  validateWebhookSignature({ xSignature, xRequestId, dataId }) {
    if (!webhookSecret) {
      if (environment === 'production') {
        logger.error('MERCADOPAGO_WEBHOOK_SECRET is required in production');
        return false;
      }
      logger.warn('MERCADOPAGO_WEBHOOK_SECRET not set; skipping webhook signature validation (non-production)');
      return true;
    }

    try {
      WebhookSignatureValidator.validate({
        xSignature,
        xRequestId,
        dataId: dataId != null ? String(dataId) : undefined,
        secret: webhookSecret
      });
      return true;
    } catch (err) {
      if (err instanceof InvalidWebhookSignatureError) {
        // Manual fallback (official template) for edge cases where query data.id casing differs
        try {
          const parts = String(xSignature || '')
            .split(',')
            .reduce((acc, part) => {
              const [k, v] = part.split('=');
              if (k && v) acc[k.trim()] = v.trim();
              return acc;
            }, {});

          const ts = parts.ts;
          const v1 = parts.v1;
          if (!ts || !v1) {
            logger.warn('Invalid Mercado Pago webhook signature format');
            return false;
          }

          const normalizedId = dataId != null ? String(dataId).toLowerCase() : '';
          let manifest = '';
          if (normalizedId) manifest += `id:${normalizedId};`;
          if (xRequestId) manifest += `request-id:${xRequestId};`;
          manifest += `ts:${ts};`;

          const computed = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex');
          const valid = computed === v1;
          if (!valid) {
            logger.warn('Mercado Pago webhook signature mismatch', {
              reason: err.message || err.reason
            });
          }
          return valid;
        } catch (fallbackError) {
          logger.warn('Mercado Pago webhook signature validation failed:', {
            message: fallbackError.message
          });
          return false;
        }
      }
      throw err;
    }
  },

  /**
   * Extracts payment id from webhook/IPN payload (body + query).
   * Webhooks: body.data.id or query["data.id"]
   * Legacy IPN: query.topic=payment&query.id=<paymentId>
   */
  extractPaymentId(req) {
    const query = req.query || {};
    const body = req.body || {};

    if (body?.data?.id) return String(body.data.id);
    if (query['data.id']) return String(query['data.id']);

    const topic = query.topic || query.type || body.type;
    if ((topic === 'payment' || body?.type === 'payment') && query.id) {
      return String(query.id);
    }

    return null;
  }
};

export default mercadoPagoService;
