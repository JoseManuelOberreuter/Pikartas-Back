import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockCartService = {
  findByUserId: jest.fn(),
  create: jest.fn(),
  addItem: jest.fn(),
  updateItemQuantity: jest.fn(),
  removeItem: jest.fn(),
  clearCart: jest.fn()
};

jest.unstable_mockModule('../models/cartModel.js', () => ({
  cartService: mockCartService
}));

const mockValidators = {
  validateProductForCart: jest.fn(),
  validateCartItemData: jest.fn(),
  validateProductExists: jest.fn(),
  validateProductId: jest.fn()
};

jest.unstable_mockModule('../utils/validators.js', () => mockValidators);

const mockFormatCart = jest.fn();
jest.unstable_mockModule('../utils/formatters.js', () => ({
  formatCart: mockFormatCart
}));

const mockRequireAuth = jest.fn();
jest.unstable_mockModule('../utils/authHelper.js', () => ({
  requireAuth: mockRequireAuth
}));

let addToCart;
let getCart;
beforeAll(async () => {
  const controller = await import('../controllers/cartController.js');
  addToCart = controller.addToCart;
  getCart = controller.getCart;
});

const createResponseMock = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('cartController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAuth.mockReturnValue(true);
  });

  it('adds item to cart when validations pass', async () => {
    const req = {
      user: { id: 1 },
      body: { productId: 'p1', quantity: 2 }
    };
    const res = createResponseMock();

    const existingCart = { id: 11, cart_items: [] };
    const updatedCart = { id: 11, cart_items: [{ product_id: 'p1', quantity: 2 }] };
    mockCartService.findByUserId
      .mockResolvedValueOnce(existingCart)
      .mockResolvedValueOnce(updatedCart);

    mockValidators.validateCartItemData.mockReturnValue({ isValid: true });
    mockValidators.validateProductForCart.mockResolvedValue({
      isValid: true,
      product: { price: 999 }
    });
    mockFormatCart.mockReturnValue({ items: [], totalItems: 1 });

    await addToCart(req, res);

    expect(mockCartService.addItem).toHaveBeenCalledWith(existingCart.id, 'p1', 2, 999);
    expect(mockFormatCart).toHaveBeenCalledWith(updatedCart);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Producto agregado al carrito exitosamente',
        data: { items: [], totalItems: 1 }
      })
    );
  });

  it('returns 400 when cart item data is invalid', async () => {
    const req = {
      user: { id: 1 },
      body: { productId: '', quantity: 0 }
    };
    const res = createResponseMock();

    mockValidators.validateCartItemData.mockReturnValue({
      isValid: false,
      error: 'Producto requerido'
    });

    await addToCart(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Producto requerido'
      })
    );
    expect(mockCartService.addItem).not.toHaveBeenCalled();
  });

  it('returns 400 when product is out of stock', async () => {
    const req = {
      user: { id: 1 },
      body: { productId: 'p1', quantity: 1 }
    };
    const res = createResponseMock();

    const existingCart = { id: 11, cart_items: [] };
    mockCartService.findByUserId.mockResolvedValue(existingCart);
    mockValidators.validateCartItemData.mockReturnValue({ isValid: true });
    mockValidators.validateProductForCart.mockResolvedValue({
      isValid: false,
      error: 'Producto agotado.'
    });

    await addToCart(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Producto agotado.'
      })
    );
    expect(mockCartService.addItem).not.toHaveBeenCalled();
  });

  it('creates cart when not found on getCart', async () => {
    const req = { user: { id: 9 } };
    const res = createResponseMock();

    mockCartService.findByUserId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 22, cart_items: [] });
    mockCartService.create.mockResolvedValue({ id: 22, cart_items: [] });
    mockFormatCart.mockReturnValue({ items: [], totalItems: 0 });

    await getCart(req, res);

    expect(mockCartService.create).toHaveBeenCalledWith(9);
    expect(mockFormatCart).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: { items: [], totalItems: 0 }
      })
    );
  });
});

