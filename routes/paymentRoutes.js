import express from 'express';
import { 
  initiatePayment, 
  confirmPayment, 
  getPaymentStatus, 
  refundPayment,
  initiateMercadoPagoPayment,
  mercadoPagoWebhook,
  confirmMercadoPagoPayment
} from '../controllers/paymentController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

const router = express.Router();

// Transbank Webpay Plus
router.post('/initiate', authMiddleware, initiatePayment);
router.post('/confirm', confirmPayment); // Callback de Transbank (público)

// Mercado Pago Checkout Pro
router.post('/mercadopago/initiate', authMiddleware, initiateMercadoPagoPayment);
router.post('/mercadopago/webhook', mercadoPagoWebhook); // Webhooks / IPN (público)
router.get('/mercadopago/webhook', mercadoPagoWebhook); // Algunos pings de validación usan GET
router.post('/mercadopago/confirm', confirmMercadoPagoPayment); // Retorno del browser (público)

// Compartidos
router.get('/status/:orderId', authMiddleware, getPaymentStatus);
router.post('/refund/:orderId', authMiddleware, refundPayment);

export default router;
