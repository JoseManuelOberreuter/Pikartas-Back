/**
 * @swagger
 * components:
 *   schemas:
 *     ShippingAddress:
 *       type: object
 *       required:
 *         - street
 *         - city
 *         - state
 *         - zipCode
 *         - country
 *       properties:
 *         street:
 *           type: string
 *           description: Dirección de la calle
 *           example: "Av. Principal 123"
 *         city:
 *           type: string
 *           description: Ciudad
 *           example: "Santiago"
 *         state:
 *           type: string
 *           description: Estado o región
 *           example: "Metropolitana"
 *         zipCode:
 *           type: string
 *           description: Código postal
 *           example: "7500000"
 *         country:
 *           type: string
 *           description: País
 *           example: "Chile"
 *
 *     InitiatePaymentRequest:
 *       type: object
 *       required:
 *         - shippingAddress
 *         - codigoCiudadDestino
 *       properties:
 *         shippingAddress:
 *           $ref: '#/components/schemas/ShippingAddress'
 *         notes:
 *           type: string
 *           description: Notas del pedido (opcional)
 *         codigoCiudadDestino:
 *           type: integer
 *           description: Código ciudad destino Starken (debe coincidir con la cotización en checkout)
 *           example: 98
 *         clientShippingAmount:
 *           type: number
 *           description: Monto de envío mostrado al usuario tras regla de envío gratis (validación servidor)
 *         kilos:
 *           type: number
 *         alto:
 *           type: number
 *         ancho:
 *           type: number
 *         largo:
 *           type: number
 *
 *     InitiatePaymentResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             orderId:
 *               type: string
 *               description: ID de la orden creada
 *               example: "123e4567-e89b-12d3-a456-426614174000"
 *             orderNumber:
 *               type: string
 *               description: Número de orden único
 *               example: "ORD-1703123456789-ABC12"
 *             amount:
 *               type: number
 *               format: float
 *               description: Monto total de la compra
 *               example: 1599.98
 *             transbankUrl:
 *               type: string
 *               description: URL de Transbank para procesar el pago
 *               example: "https://webpay3gint.transbank.cl/rswebpaytransaction/api/webpay/v1.2/transactions"
 *             transbankToken:
 *               type: string
 *               description: Token de la transacción de Transbank
 *               example: "01ab234c-56de-7890-abcd-ef1234567890"
 *
 *     ConfirmPaymentRequest:
 *       type: object
 *       required:
 *         - token_ws
 *       properties:
 *         token_ws:
 *           type: string
 *           description: Token de transacción recibido de Transbank
 *           example: "01ab234c-56de-7890-abcd-ef1234567890"
 *
 *     ConfirmPaymentResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             orderId:
 *               type: string
 *               description: ID de la orden
 *               example: "123e4567-e89b-12d3-a456-426614174000"
 *             orderNumber:
 *               type: string
 *               description: Número de orden
 *               example: "ORD-1703123456789-ABC12"
 *             status:
 *               type: string
 *               enum: [AUTHORIZED, FAILED, NULLIFIED, PARTIALLY_NULLIFIED, CAPTURED]
 *               description: Estado de la transacción en Transbank
 *               example: "AUTHORIZED"
 *             paymentStatus:
 *               type: string
 *               enum: [paid, failed, pending, refunded]
 *               description: Estado del pago en el sistema
 *               example: "paid"
 *             amount:
 *               type: number
 *               format: float
 *               description: Monto de la transacción
 *               example: 1599.98
 *             authorizationCode:
 *               type: string
 *               description: Código de autorización de la transacción
 *               example: "1213"
 *
 *     PaymentStatusResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             orderId:
 *               type: string
 *               description: ID de la orden
 *               example: "123e4567-e89b-12d3-a456-426614174000"
 *             orderNumber:
 *               type: string
 *               description: Número de orden
 *               example: "ORD-1703123456789-ABC12"
 *             paymentStatus:
 *               type: string
 *               enum: [paid, failed, pending, refunded]
 *               description: Estado del pago en el sistema
 *               example: "paid"
 *             transbankStatus:
 *               type: string
 *               enum: [AUTHORIZED, FAILED, NULLIFIED, PARTIALLY_NULLIFIED, CAPTURED]
 *               description: Estado de la transacción en Transbank
 *               example: "AUTHORIZED"
 *             amount:
 *               type: number
 *               format: float
 *               description: Monto de la transacción
 *               example: 1599.98
 *
 *     RefundPaymentRequest:
 *       type: object
 *       properties:
 *         amount:
 *           type: number
 *           format: float
 *           description: Monto a reembolsar (opcional, si no se especifica se reembolsa el total)
 *           example: 1599.98
 *
 *     RefundPaymentResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             orderId:
 *               type: string
 *               description: ID de la orden
 *               example: "123e4567-e89b-12d3-a456-426614174000"
 *             refundAmount:
 *               type: number
 *               format: float
 *               description: Monto reembolsado
 *               example: 1599.98
 *             refundResponse:
 *               type: object
 *               description: Respuesta completa de Transbank
 *               properties:
 *                 type:
 *                   type: string
 *                   example: "REVERSED"
 *                 authorization_code:
 *                   type: string
 *                   example: "1213"
 *                 authorization_date:
 *                   type: string
 *                   format: date-time
 *                   example: "2023-12-21T15:30:00.000Z"
 *                 nullified_amount:
 *                   type: number
 *                   format: float
 *                   example: 1599.98
 *                 balance:
 *                   type: number
 *                   format: float
 *                   example: 0
 */

/**
 * @swagger
 * /api/payments/initiate:
 *   post:
 *     summary: Iniciar proceso de pago con Transbank
 *     description: |
 *       Inicia el proceso de pago creando una orden y una transacción en Transbank Webpay Plus.
 *       El usuario será redirigido a Transbank para completar el pago.
 *       
 *       **Flujo de pago:**
 *       1. Se crea una orden con los productos del carrito
 *       2. Se crea una transacción en Transbank
 *       3. Se limpia el carrito del usuario
 *       4. Se retorna la URL de Transbank para redirigir al usuario
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InitiatePaymentRequest'
 *     responses:
 *       200:
 *         description: Proceso de pago iniciado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InitiatePaymentResponse'
 *       400:
 *         description: Error de validación o carrito vacío
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "El carrito está vacío"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/VerificationRequiredError'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Error al procesar el pago: Error de conexión con Transbank"
 */

/**
 * @swagger
 * /api/payments/confirm:
 *   post:
 *     summary: Confirmar pago (Callback de Transbank)
 *     description: |
 *       Confirma el pago después de que el usuario complete el proceso en Transbank.
 *       Este endpoint es llamado automáticamente por Transbank como callback.
 *       
 *       **Estados de transacción:**
 *       - `AUTHORIZED`: Pago aprobado
 *       - `FAILED`: Pago rechazado
 *       - `NULLIFIED`: Transacción anulada
 *       - `PARTIALLY_NULLIFIED`: Transacción parcialmente anulada
 *       - `CAPTURED`: Transacción capturada
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ConfirmPaymentRequest'
 *     responses:
 *       200:
 *         description: Pago confirmado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConfirmPaymentResponse'
 *       400:
 *         description: Token de transacción requerido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Token de transacción requerido"
 *       404:
 *         description: Orden no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Orden no encontrada"
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Error al confirmar el pago: Error de conexión con Transbank"
 */

/**
 * @swagger
 * /api/payments/status/{orderId}:
 *   get:
 *     summary: Obtener estado del pago
 *     description: |
 *       Obtiene el estado actual del pago de una orden específica.
 *       Incluye tanto el estado interno del sistema como el estado en Transbank.
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la orden
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Estado del pago obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaymentStatusResponse'
 *       404:
 *         description: Orden no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Orden no encontrada"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/VerificationRequiredError'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Error al obtener el estado del pago: Error de conexión con Transbank"
 */

/**
 * @swagger
 * /api/payments/refund/{orderId}:
 *   post:
 *     summary: Anular pago (Reembolso)
 *     description: |
 *       Anula una transacción y procesa un reembolso a través de Transbank o Mercado Pago
 *       según el `payment_method` de la orden.
 *     tags: [Payments, Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la orden a anular
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefundPaymentRequest'
 *     responses:
 *       200:
 *         description: Pago anulado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RefundPaymentResponse'
 *       400:
 *         description: Error de validación o transacción no anulable
 *       404:
 *         description: Orden no encontrada
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Error interno del servidor
 */

/**
 * @swagger
 * /api/payments/mercadopago/initiate:
 *   post:
 *     summary: Iniciar pago con Mercado Pago (Checkout Pro)
 *     description: |
 *       Crea la orden desde el carrito y una preferencia de Checkout Pro en el backend.
 *       El cliente solo recibe `preferenceId` + `initPoint` para redirigir al usuario.
 *       Nunca se crea el `preference_id` en el frontend.
 *     tags: [Payments, MercadoPago]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InitiatePaymentRequest'
 *     responses:
 *       200:
 *         description: Preferencia creada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     orderId:
 *                       type: string
 *                     orderNumber:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     preferenceId:
 *                       type: string
 *                       example: "123456789-abcdef"
 *                     initPoint:
 *                       type: string
 *                       description: URL de redirección a Mercado Pago
 *                     environment:
 *                       type: string
 *                       enum: [sandbox, production]
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       503:
 *         description: Mercado Pago o envío no configurados
 */

/**
 * @swagger
 * /api/payments/mercadopago/webhook:
 *   post:
 *     summary: Webhook / IPN de Mercado Pago
 *     description: |
 *       Recibe notificaciones de pago. Valida `x-signature` cuando está configurado
 *       `MERCADOPAGO_WEBHOOK_SECRET`. Consulta el pago en la API y actualiza la orden.
 *       Endpoint público (sin JWT).
 *     tags: [Payments, MercadoPago]
 *     parameters:
 *       - in: query
 *         name: data.id
 *         schema:
 *           type: string
 *         description: ID del recurso (pago) notificado
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Tipo de notificación (payment)
 *       - in: query
 *         name: topic
 *         schema:
 *           type: string
 *         description: Topic IPN legacy (payment)
 *     responses:
 *       200:
 *         description: Notificación aceptada
 *       401:
 *         description: Firma inválida
 *       500:
 *         description: Error interno (MP reintentará)
 *   get:
 *     summary: Ping / validación de URL de webhook
 *     tags: [Payments, MercadoPago]
 *     responses:
 *       200:
 *         description: OK
 */

/**
 * @swagger
 * /api/payments/mercadopago/confirm:
 *   post:
 *     summary: Confirmar / sincronizar pago Mercado Pago (retorno browser)
 *     description: |
 *       Usado tras `back_urls` para que el frontend consulte el estado.
 *       La fuente de verdad del estado final es el webhook.
 *     tags: [Payments, MercadoPago]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               payment_id:
 *                 type: string
 *               preference_id:
 *                 type: string
 *               order_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Estado sincronizado
 *       400:
 *         description: Faltan identificadores
 *       404:
 *         description: Orden no encontrada
 */


