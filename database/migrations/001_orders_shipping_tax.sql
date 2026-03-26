-- Ejecutar en Supabase SQL Editor si las columnas aún no existen.
-- Orden: totales de envío (Starken) e impuesto alineados con checkout.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tax_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS shipping_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS starken_codigo_ciudad_destino integer;

COMMENT ON COLUMN public.orders.tax_amount IS 'Impuesto aplicado al subtotal (ej. IVA)';
COMMENT ON COLUMN public.orders.shipping_amount IS 'Costo de envío cobrado (post regla envío gratis)';
COMMENT ON COLUMN public.orders.starken_codigo_ciudad_destino IS 'Código ciudad destino Starken usado en cotización';
