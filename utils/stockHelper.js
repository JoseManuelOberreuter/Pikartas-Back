import { orderService } from '../models/orderModel.js';
import { productService } from '../models/productModel.js';
import logger from './logger.js';

/**
 * Reserva stock para todos los items de una orden
 * Descuenta la cantidad del stock disponible de cada producto
 * @param {number|string} orderId - ID de la orden
 * @returns {Promise<void>}
 */
export const reserveStockForOrder = async (orderId) => {
  try {
    // Obtener la orden con sus items
    const order = await orderService.findById(orderId);
    
    if (!order) {
      throw new Error(`Orden con ID ${orderId} no encontrada`);
    }

    if (!order.order_items || order.order_items.length === 0) {
      logger.warn(`Orden ${orderId} no tiene items para reservar stock`);
      return;
    }

    // Iterar sobre cada item y reservar stock
    for (const item of order.order_items) {
      if (!item.product_id || !item.quantity) {
        logger.warn(`Item inválido en orden ${orderId}:`, item);
        continue;
      }

      try {
        // Obtener el producto actual
        const product = await productService.findByIdAny(item.product_id);
        
        if (!product) {
          logger.error(`Producto ${item.product_id} no encontrado para reservar stock en orden ${orderId}`);
          continue;
        }

        // Validar que hay stock suficiente
        const currentStock = product.stock || 0;
        if (currentStock < item.quantity) {
          const stockMessage = currentStock <= 0
            ? `Producto ${item.product_id} agotado.`
            : `Stock insuficiente para producto ${item.product_id}. Stock disponible: ${currentStock}, Cantidad requerida: ${item.quantity}`;
          throw new Error(stockMessage);
        }

        // Descontar stock (reservar)
        const newStock = Math.max(0, currentStock - item.quantity);
        await productService.update(item.product_id, { stock: newStock });

        logger.info(`Stock reservado para orden ${orderId}:`, {
          productId: item.product_id,
          quantity: item.quantity,
          previousStock: currentStock,
          newStock
        });
      } catch (error) {
        logger.error(`Error reservando stock para producto ${item.product_id} en orden ${orderId}:`, {
          message: error.message,
          productId: item.product_id,
          quantity: item.quantity
        });
        throw error;
      }
    }
  } catch (error) {
    logger.error(`Error reservando stock para orden ${orderId}:`, {
      message: error.message
    });
    throw error;
  }
};

/**
 * Libera stock reservado de todos los items de una orden
 * Devuelve la cantidad al stock disponible de cada producto
 * @param {number|string} orderId - ID de la orden
 * @returns {Promise<void>}
 */
export const releaseStockForOrder = async (orderId) => {
  try {
    // Obtener la orden con sus items
    const order = await orderService.findById(orderId);
    
    if (!order) {
      logger.warn(`Orden ${orderId} no encontrada para liberar stock`);
      return;
    }

    if (!order.order_items || order.order_items.length === 0) {
      logger.warn(`Orden ${orderId} no tiene items para liberar stock`);
      return;
    }

    // Iterar sobre cada item y liberar stock
    for (const item of order.order_items) {
      if (!item.product_id || !item.quantity) {
        logger.warn(`Item inválido en orden ${orderId}:`, item);
        continue;
      }

      try {
        // Obtener el producto actual
        const product = await productService.findByIdAny(item.product_id);
        
        if (!product) {
          logger.warn(`Producto ${item.product_id} no encontrado para liberar stock en orden ${orderId}`);
          continue;
        }

        // Devolver stock (sumar)
        const currentStock = product.stock || 0;
        const newStock = currentStock + item.quantity;
        await productService.update(item.product_id, { stock: newStock });

        logger.info(`Stock liberado para orden ${orderId}:`, {
          productId: item.product_id,
          quantity: item.quantity,
          previousStock: currentStock,
          newStock
        });
      } catch (error) {
        // Log error but continue with other items
        logger.error(`Error liberando stock para producto ${item.product_id} en orden ${orderId}:`, {
          message: error.message,
          productId: item.product_id,
          quantity: item.quantity
        });
      }
    }
  } catch (error) {
    logger.error(`Error liberando stock para orden ${orderId}:`, {
      message: error.message
    });
    // No lanzar error, solo registrar para no bloquear la cancelación
  }
};

/**
 * Valida que hay stock suficiente para todos los items de un carrito
 * @param {Array} cartItems - Items del carrito con product_id y quantity
 * @returns {Promise<{isValid: boolean, error: string|null}>}
 */
export const validateStockForCart = async (cartItems) => {
  try {
    if (!cartItems || cartItems.length === 0) {
      return { isValid: true, error: null };
    }

    for (const item of cartItems) {
      if (!item.product_id || !item.quantity) {
        return {
          isValid: false,
          error: `Item inválido: falta product_id o quantity`
        };
      }

      const product = await productService.findByIdAny(item.product_id);
      
      if (!product) {
        return {
          isValid: false,
          error: `Producto ${item.product_id} no encontrado`
        };
      }

      const availableStock = product.stock || 0;
      if (availableStock < item.quantity) {
        const stockMessage = availableStock <= 0
          ? `${product.name || `producto ${item.product_id}`} agotado.`
          : `Stock insuficiente para ${product.name || `producto ${item.product_id}`}. Stock disponible: ${availableStock}, Cantidad solicitada: ${item.quantity}`;

        return {
          isValid: false,
          error: stockMessage
        };
      }
    }

    return { isValid: true, error: null };
  } catch (error) {
    logger.error('Error validando stock para carrito:', {
      message: error.message
    });
    return {
      isValid: false,
      error: `Error al validar stock: ${error.message}`
    };
  }
};
