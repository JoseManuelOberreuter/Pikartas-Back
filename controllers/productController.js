import { productService } from '../models/productModel.js';
import { supabase } from '../database.js';
import multer from 'multer';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';
import { validateProductId, validatePrice, validateStock, validateProductRequiredFields, validateDiscountPercentage, validateSaleDates } from '../utils/validators.js';
import { buildProductQuery } from '../utils/productQueryBuilder.js';
import { uploadImage, deleteImage } from '../utils/imageHelper.js';
import { successResponse, errorResponse, notFoundResponse, serverErrorResponse } from '../utils/responseHelper.js';
import { formatProduct } from '../utils/formatters.js';

dotenv.config();

// Configure multer for image upload
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo se permiten: jpeg, png, webp'), false);
    }
  }
});

// Multer for handling FormData without files (fields only)
const uploadNone = multer();

// Get all products (public)
export const getAllProducts = async (req, res) => {
  try {
    const { page, limit, category, search, minPrice, maxPrice, sortBy, sortOrder } = req.query;

    const result = await buildProductQuery({
      page,
      limit: limit || 10,
      sortBy,
      sortOrder,
      category,
      search,
      minPrice,
      maxPrice,
      isActive: true // Only active products
    });

    return successResponse(res, {
      products: result.data,
      pagination: result.pagination,
      filters: { category, search, minPrice, maxPrice }
    });
  } catch (error) {
    logger.error('Error obteniendo productos:', { message: error.message });
    return serverErrorResponse(res, error);
  }
};

// Get product by ID (public)
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID
    const idValidation = validateProductId(id);
    if (!idValidation.isValid) {
      return errorResponse(res, idValidation.error, 400);
    }

    const product = await productService.findById(idValidation.id);

    if (!product) {
      return notFoundResponse(res, 'Producto');
    }

    const formattedProduct = formatProduct(product);
    return successResponse(res, formattedProduct);

  } catch (error) {
    logger.error('Error obteniendo producto:', { message: error.message });
    return serverErrorResponse(res, error);
  }
};

// Create new product (admin only)
export const createProduct = async (req, res) => {
  try {
    const { name, description, price, stock, category, isActive, isFeatured, isOnSale, discountPercentage, saleStartDate, saleEndDate } = req.body;

    // Validate required fields
    const requiredValidation = validateProductRequiredFields({ name, description, price, category });
    if (!requiredValidation.isValid) {
      return errorResponse(res, `Faltan campos requeridos: ${requiredValidation.missingFields.join(', ')}`, 400);
    }

    // Validate price
    const priceValidation = validatePrice(price);
    if (!priceValidation.isValid) {
      return errorResponse(res, priceValidation.error, 400);
    }

    // Validate stock (allow empty, defaults to 0)
    const stockValidation = validateStock(stock, true);
    if (!stockValidation.isValid) {
      return errorResponse(res, stockValidation.error, 400);
    }

    // Validate discount percentage if on sale
    if (isOnSale === 'true' || isOnSale === true) {
      const discountValidation = validateDiscountPercentage(discountPercentage);
      if (!discountValidation.isValid) {
        return errorResponse(res, discountValidation.error, 400);
      }

      // Validate sale dates
      const datesValidation = validateSaleDates(saleStartDate, saleEndDate);
      if (!datesValidation.isValid) {
        return errorResponse(res, datesValidation.error, 400);
      }
    }

    // Process image if uploaded
    let imageUrl = '';
    if (req.file) {
      imageUrl = await uploadImage(req.file);
    }

    // Create product
    const productData = {
      name: name.trim(),
      description: description.trim(),
      price: priceValidation.value,
      stock: stockValidation.stock || 0,
      category: category.trim(),
      image: imageUrl,
      isActive: isActive !== undefined ? isActive === 'true' : true,
      isFeatured: isFeatured !== undefined ? (isFeatured === 'true' || isFeatured === true) : false,
      isOnSale: isOnSale !== undefined ? (isOnSale === 'true' || isOnSale === true) : false,
      discountPercentage: discountPercentage !== undefined && discountPercentage !== '' ? parseFloat(discountPercentage) : null,
      saleStartDate: saleStartDate || null,
      saleEndDate: saleEndDate || null
    };

    const newProduct = await productService.create(productData);
    const formattedProduct = formatProduct(newProduct);

    return successResponse(res, formattedProduct, 'Producto creado exitosamente', 201);

  } catch (error) {
    logger.error('Error creando producto:', { message: error.message });
    return serverErrorResponse(res, error);
  }
};

// Update product (admin only)
export const updateProduct = async (req, res) => {
  let updateData = {}; // Declare updateData in outer scope for error handling
  try {
    const { id } = req.params;
    
    // Log incoming data for debugging
    logger.info('Update product request:', {
      productId: id,
      body: req.body,
      hasFile: !!req.file,
      filesCount: req.files ? req.files.length : 0
    });
    
    const { name, description, price, stock, category, isActive, is_active, isFeatured, isOnSale, discountPercentage, saleStartDate, saleEndDate } = req.body;

    // Validate ID
    const idValidation = validateProductId(id);
    if (!idValidation.isValid) {
      return errorResponse(res, idValidation.error, 400);
    }

    // Find existing product
    const existingProduct = await productService.findByIdAny(idValidation.id);
    if (!existingProduct) {
      return notFoundResponse(res, 'Producto');
    }

    // Prepare update data
    updateData = {};

    if (name) updateData.name = name.trim();
    if (description) updateData.description = description.trim();
    if (category) updateData.category = category.trim();
    
    // Handle isActive
    const isActiveValue = isActive !== undefined ? isActive : is_active;
    if (isActiveValue !== undefined) {
      updateData.is_active = isActiveValue === 'true' || isActiveValue === true;
    }

    // Helper function to convert FormData boolean strings to boolean
    const parseFormDataBoolean = (value) => {
      if (value === undefined || value === null || value === '') {
        return undefined;
      }
      if (typeof value === 'string') {
        const lowerValue = value.toLowerCase().trim();
        return lowerValue === 'true' || lowerValue === '1';
      }
      return Boolean(value);
    };

    // Helper function to normalize date format (datetime-local to ISO)
    const normalizeDate = (dateValue) => {
      if (!dateValue || dateValue === '' || dateValue === null) {
        return null;
      }
      // If it's already in ISO format, return as is
      if (typeof dateValue === 'string' && dateValue.includes('T') && dateValue.includes('Z')) {
        return dateValue;
      }
      // If it's in datetime-local format (YYYY-MM-DDTHH:mm), convert to ISO
      if (typeof dateValue === 'string' && dateValue.includes('T') && !dateValue.includes('Z')) {
        // Add seconds and timezone if missing
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      }
      // Try to parse as date
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
      return dateValue; // Return original if can't parse
    };

    // Handle isFeatured - FormData sends booleans as strings
    if (isFeatured !== undefined && isFeatured !== null && isFeatured !== '') {
      const featuredValue = parseFormDataBoolean(isFeatured);
      updateData.is_featured = featuredValue;
      logger.info('isFeatured parsed:', { original: isFeatured, parsed: featuredValue });
    }

    // Handle isOnSale and related fields - FormData sends booleans as strings
    if (isOnSale !== undefined && isOnSale !== null && isOnSale !== '') {
      const onSaleValue = parseFormDataBoolean(isOnSale);
      updateData.is_on_sale = onSaleValue;
      logger.info('isOnSale parsed:', { original: isOnSale, parsed: onSaleValue });

      if (onSaleValue) {
        // Validate discount percentage if on sale (skip if undefined, empty, or string "undefined")
        if (discountPercentage !== undefined && discountPercentage !== null && discountPercentage !== '' && discountPercentage !== 'undefined') {
          const discountValidation = validateDiscountPercentage(discountPercentage);
          if (!discountValidation.isValid) {
            logger.error('Discount validation failed:', { discountPercentage, error: discountValidation.error });
            return errorResponse(res, discountValidation.error, 400);
          }
          updateData.discount_percentage = discountValidation.percentage;
        } else {
          // If discountPercentage is not provided but trying to activate sale, use existing or error
          if (!existingProduct.discount_percentage) {
            logger.error('Discount percentage required but not provided');
            return errorResponse(res, 'Para activar la oferta, se requiere un porcentaje de descuento válido', 400);
          }
          updateData.discount_percentage = existingProduct.discount_percentage;
        }

        // Validate sale dates - normalize format first
        let startDate = saleStartDate !== undefined && saleStartDate !== null && saleStartDate !== '' 
          ? normalizeDate(saleStartDate)
          : (existingProduct.sale_start_date ? normalizeDate(existingProduct.sale_start_date) : null);
        let endDate = saleEndDate !== undefined && saleEndDate !== null && saleEndDate !== ''
          ? normalizeDate(saleEndDate)
          : (existingProduct.sale_end_date ? normalizeDate(existingProduct.sale_end_date) : null);
        
        logger.info('Sale dates normalized:', { 
          originalStart: saleStartDate, 
          normalizedStart: startDate,
          originalEnd: saleEndDate,
          normalizedEnd: endDate,
          existingStart: existingProduct.sale_start_date,
          existingEnd: existingProduct.sale_end_date
        });
        
        if (!startDate || !endDate) {
          logger.error('Sale dates missing:', { startDate, endDate });
          return errorResponse(res, 'Para activar la oferta, se requieren fechas de inicio y fin válidas', 400);
        }
        
        const datesValidation = validateSaleDates(startDate, endDate);
        if (!datesValidation.isValid) {
          logger.error('Sale dates validation failed:', { startDate, endDate, error: datesValidation.error });
          return errorResponse(res, datesValidation.error, 400);
        }
        updateData.sale_start_date = startDate;
        updateData.sale_end_date = endDate;
      } else {
        // If turning off sale, clear sale-related fields
        updateData.discount_percentage = null;
        updateData.sale_start_date = null;
        updateData.sale_end_date = null;
      }
    } else if (discountPercentage !== undefined || saleStartDate !== undefined || saleEndDate !== undefined) {
      // If sale fields are being updated but isOnSale is not explicitly set
      if (existingProduct.is_on_sale) {
        if (discountPercentage !== undefined && discountPercentage !== null && discountPercentage !== '' && discountPercentage !== 'undefined') {
          const discountValidation = validateDiscountPercentage(discountPercentage);
          if (!discountValidation.isValid) {
            logger.error('Discount validation failed (partial update):', { discountPercentage, error: discountValidation.error });
            return errorResponse(res, discountValidation.error, 400);
          }
          updateData.discount_percentage = discountValidation.percentage;
        }
        if ((saleStartDate !== undefined && saleStartDate !== null && saleStartDate !== '') || 
            (saleEndDate !== undefined && saleEndDate !== null && saleEndDate !== '')) {
          const normalizedStartDate = saleStartDate !== undefined && saleStartDate !== null && saleStartDate !== '' 
            ? normalizeDate(saleStartDate)
            : (existingProduct.sale_start_date ? normalizeDate(existingProduct.sale_start_date) : null);
          const normalizedEndDate = saleEndDate !== undefined && saleEndDate !== null && saleEndDate !== ''
            ? normalizeDate(saleEndDate)
            : (existingProduct.sale_end_date ? normalizeDate(existingProduct.sale_end_date) : null);
          
          const datesValidation = validateSaleDates(normalizedStartDate, normalizedEndDate);
          if (!datesValidation.isValid) {
            logger.error('Sale dates validation failed (partial update):', { 
              startDate: normalizedStartDate, 
              endDate: normalizedEndDate, 
              error: datesValidation.error 
            });
            return errorResponse(res, datesValidation.error, 400);
          }
          if (saleStartDate !== undefined && saleStartDate !== null && saleStartDate !== '') {
            updateData.sale_start_date = normalizedStartDate;
          }
          if (saleEndDate !== undefined && saleEndDate !== null && saleEndDate !== '') {
            updateData.sale_end_date = normalizedEndDate;
          }
        }
      }
    }

    // Validate and update price (skip if undefined, empty, or string "undefined")
    if (price !== undefined && price !== null && price !== '' && price !== 'undefined') {
      const priceValidation = validatePrice(price);
      if (!priceValidation.isValid) {
        return errorResponse(res, priceValidation.error, 400);
      }
      updateData.price = priceValidation.value;
    }

    // Validate and update stock (skip if undefined, empty, or string "undefined")
    if (stock !== undefined && stock !== null && stock !== '' && stock !== 'undefined') {
      const stockValidation = validateStock(stock, true);
      if (!stockValidation.isValid) {
        return errorResponse(res, stockValidation.error, 400);
      }
      updateData.stock = stockValidation.stock;
      
      // If stock reaches 0, deactivate product automatically
      if (stockValidation.stock === 0) {
        updateData.is_active = false;
      }
    }

    // Process new image if uploaded
    // Handle req.files from upload.fields()
    const imageFile = req.files && req.files.image && req.files.image[0] ? req.files.image[0] : null;
    if (imageFile) {
      if (existingProduct.image) {
        try {
          await deleteImage(existingProduct.image);
        } catch (error) {
          logger.warn('Error eliminando imagen anterior:', { message: error.message });
        }
      }
      updateData.image = await uploadImage(imageFile);
    }

    // Filter out undefined values and string "undefined" from updateData before sending to Supabase
    const cleanUpdateData = Object.keys(updateData).reduce((acc, key) => {
      const value = updateData[key];
      // Skip undefined, null, empty strings, and the string "undefined"
      if (value !== undefined && value !== null && value !== '' && value !== 'undefined') {
        acc[key] = value;
      }
      return acc;
    }, {});

    // Log what will be updated
    logger.info('Updating product with data:', {
      productId: idValidation.id,
      productIdType: typeof idValidation.id,
      updateData: cleanUpdateData,
      updateDataKeys: Object.keys(cleanUpdateData),
      originalUpdateData: updateData,
      originalUpdateDataKeys: Object.keys(updateData)
    });

    // Check if there's anything to update
    if (Object.keys(cleanUpdateData).length === 0) {
      logger.warn('No fields to update after cleaning:', { 
        productId: idValidation.id, 
        originalUpdateData: updateData 
      });
      return errorResponse(res, 'No hay campos para actualizar', 400);
    }

    // Update product
    logger.info('Calling productService.update:', { 
      id: idValidation.id, 
      idType: typeof idValidation.id,
      cleanUpdateData 
    });
    const updatedProduct = await productService.update(idValidation.id, cleanUpdateData);
    const formattedProduct = formatProduct(updatedProduct);

    logger.info('Product updated successfully:', { productId: idValidation.id });
    return successResponse(res, formattedProduct, 'Producto actualizado exitosamente');

  } catch (error) {
    // Log detailed error information
    logger.error('Error actualizando producto:', { 
      message: error.message,
      stack: error.stack,
      error: error,
      updateData: updateData,
      productId: req.params?.id,
      body: req.body,
      errorName: error.name,
      errorCode: error.code
    });
    
    // If it's a validation error or known error, return 400 instead of 500
    if (error.name === 'ValidationError' || error.message?.includes('validation') || error.message?.includes('requerido')) {
      return errorResponse(res, error.message || 'Error de validación', 400);
    }
    
    // If it's a database constraint error, return 400 with a user-friendly message
    if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return errorResponse(res, 'El producto ya existe o hay un conflicto con los datos', 400);
    }
    
    // For other errors, return 500 with generic message in production
    return serverErrorResponse(res, error);
  }
};

// Delete product (admin only) - Soft delete
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ID
    const idValidation = validateProductId(id);
    if (!idValidation.isValid) {
      return errorResponse(res, idValidation.error, 400);
    }
    
    // Verify if product exists (use findByIdAny for admin operations)
    const existingProduct = await productService.findByIdAny(idValidation.id);
    
    if (!existingProduct) {
      return notFoundResponse(res, 'Producto');
    }
    
    // Delete product (soft delete)
    await productService.delete(idValidation.id);
    
    return successResponse(res, null, 'Producto eliminado exitosamente');

  } catch (error) {
    logger.error('Error eliminando producto:', { 
      message: error.message,
      stack: error.stack,
      error: error,
      productId: req.params?.id,
      errorName: error.name,
      errorCode: error.code
    });
    
    // If it's a not found error, return 404
    if (error.code === 'PGRST116' || error.message?.includes('no encontrado')) {
      return notFoundResponse(res, 'Producto');
    }
    
    // For other errors, return 500 with generic message in production
    return serverErrorResponse(res, error);
  }
};

// Get all categories (public)
export const getCategories = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('category')
      .eq('is_active', true);

    if (error) throw error;

    // Get unique categories
    const categories = [...new Set(data.map(item => item.category))].filter(Boolean);

    return successResponse(res, categories);

  } catch (error) {
    logger.error('Error obteniendo categorías:', { message: error.message });
    return serverErrorResponse(res, error);
  }
};

// Update stock (admin only)
export const updateStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { stock, operation } = req.body;

    // Validate ID
    const idValidation = validateProductId(id);
    if (!idValidation.isValid) {
      return errorResponse(res, idValidation.error, 400);
    }

    // Validate stock
    const stockValidation = validateStock(stock);
    if (!stockValidation.isValid) {
      return errorResponse(res, stockValidation.error, 400);
    }

    // Verify if product exists (use findByIdAny for admin operations)
    const existingProduct = await productService.findByIdAny(idValidation.id);
    if (!existingProduct) {
      return notFoundResponse(res, 'Producto');
    }

    let newStock;
    if (operation === 'add') {
      newStock = existingProduct.stock + stockValidation.stock;
    } else if (operation === 'subtract') {
      newStock = Math.max(0, existingProduct.stock - stockValidation.stock);
    } else {
      newStock = stockValidation.stock; // Set absolute stock
    }

    // Update stock
    const updatedProduct = await productService.update(idValidation.id, { stock: newStock });
    const formattedProduct = formatProduct(updatedProduct);

    return successResponse(res, {
      ...formattedProduct,
        previousStock: existingProduct.stock,
        operation: operation || 'set'
    }, 'Stock actualizado exitosamente');

  } catch (error) {
    logger.error('Error actualizando stock:', { 
      message: error.message,
      stack: error.stack,
      error: error,
      productId: req.params?.id,
      body: req.body,
      errorName: error.name,
      errorCode: error.code
    });
    
    // If it's a not found error, return 404
    if (error.code === 'PGRST116' || error.message?.includes('no encontrado')) {
      return notFoundResponse(res, 'Producto');
    }
    
    // For other errors, return 500 with generic message in production
    return serverErrorResponse(res, error);
  }
};

// Get all products for admin (includes inactive)
export const getAllProductsAdmin = async (req, res) => {
  try {
    // Listados mutables: no cachear en CDN/proxy/navegador (evita tabla desactualizada tras editar).
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    const { page, limit, category, search, isActive, sortBy, sortOrder } = req.query;

    const result = await buildProductQuery({
      page,
      limit: limit || 20,
      sortBy,
      sortOrder,
      category,
      search,
      isActive: isActive !== undefined ? isActive === 'true' : null // All products
    });

    // Get statistics (admin only)
    const { data: statsData, error: statsError } = await supabase
      .from('products')
      .select('is_active, stock');

    if (statsError) throw statsError;

    const stats = {
      total: statsData.length,
      active: statsData.filter(p => p.is_active).length,
      inactive: statsData.filter(p => !p.is_active).length,
      lowStock: statsData.filter(p => p.stock < 5).length
    };

    return successResponse(res, {
      products: result.data,
      pagination: result.pagination,
      stats,
      filters: { category, search, isActive }
    });

  } catch (error) {
    logger.error('Error obteniendo productos admin:', { message: error.message });
    return serverErrorResponse(res, error);
  }
};

// Get featured products (public)
export const getFeaturedProducts = async (req, res) => {
  try {
    const { page, limit } = req.query;
    const limitInt = parseInt(limit) || 10;
    const pageInt = parseInt(page) || 1;

    const result = await buildProductQuery({
      page: pageInt,
      limit: limitInt,
      isActive: true,
      isFeatured: true
    });

    return successResponse(res, {
      products: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    logger.error('Error obteniendo productos destacados:', { message: error.message });
    return serverErrorResponse(res, error);
  }
};

// Get products on sale (public)
export const getOnSaleProducts = async (req, res) => {
  try {
    const { page, limit } = req.query;
    const limitInt = parseInt(limit) || 10;
    const pageInt = parseInt(page) || 1;

    const result = await buildProductQuery({
      page: pageInt,
      limit: limitInt,
      isActive: true,
      isOnSale: true
    });

    return successResponse(res, {
      products: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    logger.error('Error obteniendo productos en oferta:', { message: error.message });
    return serverErrorResponse(res, error);
  }
};

// Export upload middleware
export { upload }; 
