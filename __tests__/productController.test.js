import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockProductService = {
  create: jest.fn(),
  findById: jest.fn(),
  findByIdAny: jest.fn(),
  update: jest.fn()
};

jest.unstable_mockModule('../models/productModel.js', () => ({
  productService: mockProductService
}));

const mockValidators = {
  validateProductId: jest.fn(),
  validatePrice: jest.fn(),
  validateStock: jest.fn(),
  validateProductRequiredFields: jest.fn(),
  validateDiscountPercentage: jest.fn(),
  validateSaleDates: jest.fn()
};

jest.unstable_mockModule('../utils/validators.js', () => mockValidators);

const mockImageHelper = {
  uploadImage: jest.fn(),
  deleteImage: jest.fn()
};

jest.unstable_mockModule('../utils/imageHelper.js', () => mockImageHelper);

const mockFormatProduct = jest.fn();
jest.unstable_mockModule('../utils/formatters.js', () => ({
  formatProduct: mockFormatProduct
}));

let createProduct;
let updateStock;
beforeAll(async () => {
  const controller = await import('../controllers/productController.js');
  createProduct = controller.createProduct;
  updateStock = controller.updateStock;
});

const createResponseMock = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('productController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when required fields are missing on create', async () => {
    const req = {
      body: { name: '', description: '', price: '', category: '' }
    };
    const res = createResponseMock();

    mockValidators.validateProductRequiredFields.mockReturnValue({
      isValid: false,
      missingFields: ['name']
    });

    await createProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('name')
      })
    );
    expect(mockProductService.create).not.toHaveBeenCalled();
  });

  it('creates product when validations pass', async () => {
    const req = {
      body: {
        name: 'Producto',
        description: 'Desc',
        price: '5000',
        stock: '3',
        category: 'General',
        isActive: 'true'
      }
    };
    const res = createResponseMock();

    mockValidators.validateProductRequiredFields.mockReturnValue({ isValid: true });
    mockValidators.validatePrice.mockReturnValue({ isValid: true, value: 5000 });
    mockValidators.validateStock.mockReturnValue({ isValid: true, stock: 3 });

    const productRecord = { id: 1, name: 'Producto' };
    mockProductService.create.mockResolvedValue(productRecord);
    mockFormatProduct.mockReturnValue({ id: 1, name: 'Producto' });

    await createProduct(req, res);

    expect(mockProductService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Producto',
        price: 5000,
        stock: 3,
        isActive: true
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Producto creado exitosamente',
        data: { id: 1, name: 'Producto' }
      })
    );
  });

  it('updates stock using subtract operation and clamps at zero', async () => {
    const req = {
      params: { id: '10' },
      body: { stock: 10, operation: 'subtract' }
    };
    const res = createResponseMock();

    mockValidators.validateProductId.mockReturnValue({ isValid: true, id: 10 });
    mockValidators.validateStock.mockReturnValue({ isValid: true, stock: 10 });
    mockProductService.findByIdAny.mockResolvedValue({ id: 10, stock: 4 });
    const updatedProduct = { id: 10, stock: 0 };
    mockProductService.update.mockResolvedValue(updatedProduct);
    mockFormatProduct.mockReturnValue(updatedProduct);

    await updateStock(req, res);

    expect(mockProductService.update).toHaveBeenCalledWith(10, { stock: 0 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          previousStock: 4,
          operation: 'subtract',
          stock: 0
        })
      })
    );
  });

  it('does not deactivate product when stock is updated to zero', async () => {
    const req = {
      params: { id: '11' },
      body: { stock: 2, operation: 'subtract' }
    };
    const res = createResponseMock();

    mockValidators.validateProductId.mockReturnValue({ isValid: true, id: 11 });
    mockValidators.validateStock.mockReturnValue({ isValid: true, stock: 2 });
    mockProductService.findByIdAny.mockResolvedValue({ id: 11, stock: 2, is_active: true });
    mockProductService.update.mockResolvedValue({ id: 11, stock: 0, is_active: true });
    mockFormatProduct.mockReturnValue({ id: 11, stock: 0, is_active: true });

    await updateStock(req, res);

    expect(mockProductService.update).toHaveBeenCalledWith(11, { stock: 0 });
  });
});

