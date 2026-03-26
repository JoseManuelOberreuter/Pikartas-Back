/**
 * Cliente para API REST de cotización Starken (consultarTarifas, listar ciudades).
 * Credenciales solo vía variables de entorno.
 */
import logger from './logger.js';

const DEFAULT_REST_BASE =
  'https://restservices-qa.starken.cl/apiqa/starkenservices/rest';

function getRestBaseUrl() {
  return (process.env.STARKEN_REST_BASE_URL || DEFAULT_REST_BASE).replace(/\/$/, '');
}

function getAuthHeaders() {
  const raw = process.env.STARKEN_AUTHORIZATION_HEADER;
  if (raw && String(raw).trim()) {
    const v = String(raw).trim();
    return {
      Authorization: v.startsWith('Basic ') || v.startsWith('Bearer ') ? v : `Basic ${v}`
    };
  }
  const user = process.env.STARKEN_AUTH_USER;
  const pass = process.env.STARKEN_AUTH_PASSWORD;
  if (user && pass !== undefined) {
    const token = Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
    return { Authorization: `Basic ${token}` };
  }
  return null;
}

export function isStarkenConfigured() {
  return getAuthHeaders() !== null;
}

/**
 * @returns {{ codigoCiudadOrigen: number, rutCliente: string, alto: number, ancho: number, largo: number, kilos: number }}
 */
export function getDefaultTarifaPayload() {
  return {
    codigoCiudadOrigen: parseInt(process.env.STARKEN_CODIGO_CIUDAD_ORIGEN || '1', 10),
    rutCliente: String(process.env.STARKEN_RUT_CLIENTE || '1'),
    alto: parseFloat(process.env.STARKEN_DEFAULT_ALTO || '30'),
    ancho: parseFloat(process.env.STARKEN_DEFAULT_ANCHO || '30'),
    largo: parseFloat(process.env.STARKEN_DEFAULT_LARGO || '30'),
    kilos: parseFloat(process.env.STARKEN_DEFAULT_KILOS || '1')
  };
}

async function starkenFetch(path, options = {}) {
  const auth = getAuthHeaders();
  if (!auth) {
    const err = new Error('Starken no está configurado: defina STARKEN_AUTHORIZATION_HEADER o STARKEN_AUTH_USER/STARKEN_AUTH_PASSWORD');
    err.code = 'STARKEN_NOT_CONFIGURED';
    throw err;
  }

  const url = `${getRestBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...auth,
      ...options.headers
    }
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    logger.warn('Starken respuesta no JSON', { url, snippet: text?.slice(0, 200) });
    throw new Error(`Respuesta inválida de Starken (${res.status})`);
  }

  if (!res.ok) {
    logger.error('Starken HTTP error', { url, status: res.status, body: data });
    throw new Error(data?.mensajeRespuesta || data?.message || `Error Starken HTTP ${res.status}`);
  }

  return data;
}

/**
 * @returns {Promise<object>} respuesta cruda consultarTarifas
 */
export async function consultarTarifas(body) {
  return starkenFetch('/consultarTarifas', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export async function listarCiudadesOrigen() {
  return starkenFetch('/listarCiudadesOrigen', { method: 'GET' });
}

export async function listarCiudadesDestino() {
  return starkenFetch('/listarCiudadesDestino', { method: 'GET' });
}

const DOMICILIO_CODES = new Set([2]);
const DOMICILIO_LABEL = 'DOMICILIO';

/**
 * Elige tarifa de envío a domicilio (NORMAL).
 * @param {Array} listaTarifas
 * @returns {{ costoTotal: number, diasEntrega: number, tipoEntrega: object, tipoServicio: object } | null}
 */
export function pickDomicilioTarifa(listaTarifas) {
  if (!Array.isArray(listaTarifas) || listaTarifas.length === 0) return null;

  const domicilio = listaTarifas.find((t) => {
    const desc = t?.tipoEntrega?.descripcionTipoEntrega;
    const code = t?.tipoEntrega?.codigoTipoEntrega;
    if (desc && String(desc).toUpperCase().includes(DOMICILIO_LABEL)) return true;
    if (code !== undefined && DOMICILIO_CODES.has(Number(code))) return true;
    return false;
  });

  if (domicilio) return domicilio;

  return listaTarifas[0];
}

/**
 * Cotización domicilio con payload estándar + destino.
 * @param {number} codigoCiudadDestino
 * @param {object} [overrides] kilos, alto, ancho, largo
 */
export async function quoteDomicilio(codigoCiudadDestino, overrides = {}) {
  const defaults = getDefaultTarifaPayload();
  const body = {
    codigoCiudadOrigen: defaults.codigoCiudadOrigen,
    codigoCiudadDestino: Number(codigoCiudadDestino),
    codigoAgenciaDestino: 0,
    codigoAgenciaOrigen: 0,
    alto: overrides.alto ?? defaults.alto,
    ancho: overrides.ancho ?? defaults.ancho,
    largo: overrides.largo ?? defaults.largo,
    kilos: overrides.kilos ?? defaults.kilos,
    cuentaCorriente: '',
    cuentaCorrienteDV: '',
    rutCliente: defaults.rutCliente
  };

  const data = await consultarTarifas(body);

  if (data.codigoRespuesta !== 1 && data.codigoRespuesta !== '1') {
    const msg = data.mensajeRespuesta || 'Cotización Starken sin éxito';
    logger.warn('Starken consultarTarifas negativa', { codigo: data.codigoRespuesta, msg });
    const err = new Error(msg);
    err.code = 'STARKEN_QUOTE_FAILED';
    err.starken = data;
    throw err;
  }

  const tarifa = pickDomicilioTarifa(data.listaTarifas);
  if (!tarifa || typeof tarifa.costoTotal !== 'number') {
    const err = new Error('No hay tarifa de domicilio disponible para este destino');
    err.code = 'STARKEN_NO_RATE';
    err.starken = data;
    throw err;
  }

  return {
    body,
    response: data,
    shippingCost: Math.round(tarifa.costoTotal),
    deliveryDays: tarifa.diasEntrega,
    tarifa
  };
}

// Cache en memoria para listados (TTL 24h)
let destinoCache = { data: null, expiresAt: 0 };
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function getCachedCiudadesDestino() {
  const now = Date.now();
  if (destinoCache.data && destinoCache.expiresAt > now) {
    return destinoCache.data;
  }
  const raw = await listarCiudadesDestino();
  destinoCache = { data: raw, expiresAt: now + CACHE_TTL_MS };
  return raw;
}

export function invalidateDestinoCache() {
  destinoCache = { data: null, expiresAt: 0 };
}

export default {
  isStarkenConfigured,
  getDefaultTarifaPayload,
  consultarTarifas,
  listarCiudadesOrigen,
  listarCiudadesDestino,
  quoteDomicilio,
  pickDomicilioTarifa,
  getCachedCiudadesDestino,
  invalidateDestinoCache
};
