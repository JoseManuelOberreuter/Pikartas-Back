import logger from '../utils/logger.js';
import {
  isStarkenConfigured,
  quoteDomicilio,
  getCachedCiudadesDestino
} from '../utils/starkenService.js';
import { successResponse, serverErrorResponse, errorResponse } from '../utils/responseHelper.js';

/**
 * GET /api/shipping/destinations
 * Lista ciudades destino (cache 24h en servidor).
 */
export const getShippingDestinations = async (req, res) => {
  try {
    if (!isStarkenConfigured()) {
      return errorResponse(
        res,
        'Cotización de envío no configurada en el servidor (variables Starken).',
        503
      );
    }

    const raw = await getCachedCiudadesDestino();

    if (raw.codigoRespuesta !== 1 && raw.codigoRespuesta !== '1') {
      return errorResponse(
        res,
        raw.mensajeRespuesta || 'No se pudieron obtener destinos',
        502
      );
    }

    const cities = raw.listaCiudadesDestino || [];
    const flat = [];

    for (const ciudad of cities) {
      const comunas = ciudad.listaComunas || [];
      for (const c of comunas) {
        flat.push({
          codigoCiudad: ciudad.codigoCiudad,
          nombreCiudad: ciudad.nombreCiudad,
          codigoComuna: c.codigoComuna,
          nombreComuna: c.nombreComuna
        });
      }
    }

    return successResponse(res, {
      ciudades: cities,
      flat,
      cached: true
    });
  } catch (error) {
    logger.error('getShippingDestinations', { message: error.message });
    if (error.code === 'STARKEN_NOT_CONFIGURED') {
      return errorResponse(res, error.message, 503);
    }
    return serverErrorResponse(res, error, 'Error al obtener destinos de envío');
  }
};

/**
 * POST /api/shipping/quote
 * body: { codigoCiudadDestino, kilos?, alto?, ancho?, largo? }
 */
export const postShippingQuote = async (req, res) => {
  try {
    if (!isStarkenConfigured()) {
      return errorResponse(
        res,
        'Cotización de envío no configurada en el servidor (variables Starken).',
        503
      );
    }

    const { codigoCiudadDestino, kilos, alto, ancho, largo } = req.body || {};
    const dest = parseInt(codigoCiudadDestino, 10);
    if (!Number.isFinite(dest) || dest <= 0) {
      return errorResponse(res, 'codigoCiudadDestino inválido', 400);
    }

    const overrides = {};
    if (kilos !== undefined && kilos !== '') overrides.kilos = parseFloat(kilos);
    if (alto !== undefined && alto !== '') overrides.alto = parseFloat(alto);
    if (ancho !== undefined && ancho !== '') overrides.ancho = parseFloat(ancho);
    if (largo !== undefined && largo !== '') overrides.largo = parseFloat(largo);

    const result = await quoteDomicilio(dest, overrides);

    return successResponse(res, {
      codigoCiudadDestino: dest,
      shippingCost: result.shippingCost,
      deliveryDays: result.deliveryDays,
      tipoEntrega: result.tarifa?.tipoEntrega,
      tipoServicio: result.tarifa?.tipoServicio
    });
  } catch (error) {
    logger.error('postShippingQuote', { message: error.message });
    if (error.code === 'STARKEN_NOT_CONFIGURED') {
      return errorResponse(res, error.message, 503);
    }
    if (error.code === 'STARKEN_QUOTE_FAILED' || error.code === 'STARKEN_NO_RATE') {
      return errorResponse(res, error.message, 400);
    }
    return serverErrorResponse(res, error, 'Error al cotizar envío');
  }
};
