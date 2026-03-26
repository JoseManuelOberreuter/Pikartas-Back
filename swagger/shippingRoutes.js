/**
 * @swagger
 * components:
 *   schemas:
 *     ShippingQuoteRequest:
 *       type: object
 *       required:
 *         - codigoCiudadDestino
 *       properties:
 *         codigoCiudadDestino:
 *           type: integer
 *           description: Código de ciudad destino (Starken)
 *           example: 98
 *         kilos:
 *           type: number
 *           format: float
 *         alto:
 *           type: number
 *           format: float
 *         ancho:
 *           type: number
 *           format: float
 *         largo:
 *           type: number
 *           format: float
 *
 *     ShippingQuoteResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         data:
 *           type: object
 *           properties:
 *             codigoCiudadDestino:
 *               type: integer
 *             shippingCost:
 *               type: integer
 *               description: Costo envío domicilio en CLP (antes de regla envío gratis en checkout)
 *             deliveryDays:
 *               type: integer
 *             tipoEntrega:
 *               type: object
 *             tipoServicio:
 *               type: object
 */

/**
 * @swagger
 * /api/shipping/destinations:
 *   get:
 *     summary: Listar ciudades y comunas destino (Starken)
 *     description: Respuesta cacheada en servidor (~24h). Requiere credenciales Starken en el backend.
 *     tags: [Shipping]
 *     responses:
 *       200:
 *         description: Lista de ciudades destino
 *       503:
 *         description: Starken no configurado
 */

/**
 * @swagger
 * /api/shipping/quote:
 *   post:
 *     summary: Cotizar envío a domicilio
 *     description: Usa la API consultarTarifas de Starken y devuelve la tarifa de domicilio.
 *     tags: [Shipping]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ShippingQuoteRequest'
 *     responses:
 *       200:
 *         description: Cotización exitosa
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ShippingQuoteResponse'
 *       400:
 *         description: Parámetros inválidos o sin cobertura
 *       503:
 *         description: Starken no configurado
 */
