import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockCartService = {
  findByUserId: jest.fn(),
  clearCart: jest.fn()
};

const mockOrderService = {
  create: jest.fn(),
  createOrderItems: jest.fn(),
  findById: jest.fn(),
  updatePaymentStatus: jest.fn(),
  updateStatus: jest.fn()
};

const mockTransbankService = {
  refundTransaction: jest.fn()
};

jest.unstable_mockModule('../models/cartModel.js', () => ({
  cartService: mockCartService
}));

jest.unstable_mockModule('../models/orderModel.js', () => ({
  orderService: mockOrderService
}));

jest.unstable_mockModule('../utils/transbankService.js', () => ({
  transbankService: mockTransbankService
}));

const mockValidators = {
  validateShippingAddress: jest.fn(),
  validateOrderId: jest.fn(),
  validateOrderStatus: jest.fn()
};

jest.unstable_mockModule('../utils/validators.js', () => mockValidators);

jest.unstable_mockModule('../utils/stockHelper.js', () => ({
  validateStockForCart: jest.fn().mockResolvedValue({ isValid: true }),
  reserveStockForOrder: jest.fn().mockResolvedValue(undefined),
  releaseStockForOrder: jest.fn()
}));

jest.unstable_mockModule('../utils/starkenService.js', () => ({
  isStarkenConfigured: jest.fn(() => true),
  quoteDomicilio: jest.fn().mockResolvedValue({ shippingCost: 2500 })
}));

const mockAuthHelper = {
  requireAuth: jest.fn(),
  requireOwnershipOrAdmin: jest.fn(),
  requireAdmin: jest.fn()
};

jest.unstable_mockModule('../utils/authHelper.js', () => mockAuthHelper);

const mockFormatters = {
  formatOrder: jest.fn(),
  formatPagination: jest.fn()
};

jest.unstable_mockModule('../utils/formatters.js', () => mockFormatters);

let createOrder;
let cancelOrder;
beforeAll(async () => {
  const controller = await import('../controllers/orderController.js');
  createOrder = controller.createOrder;
  cancelOrder = controller.cancelOrder;
});

const createResponseMock = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('orderController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthHelper.requireAuth.mockReturnValue(true);
    mockAuthHelper.requireOwnershipOrAdmin.mockReturnValue(true);
    mockAuthHelper.requireAdmin.mockReturnValue(true);
  });

  it('creates an order when cart has items', async () => {
    const req = {
      user: { id: 1 },
      body: {
        shippingAddress: { street: 'A', city: 'B', state: 'C', zipCode: '1', country: 'CL' },
        notes: 'Test',
        codigoCiudadDestino: 98,
        clientShippingAmount: 2500
      }
    };
    const res = createResponseMock();

    mockValidators.validateShippingAddress.mockReturnValue({ isValid: true });
    mockCartService.findByUserId.mockResolvedValue({
      id: 5,
      cart_items: [{ product_id: 9, price: 1000, quantity: 2 }]
    });
    const orderRecord = { id: 10, order_number: 'ORD-1' };
    mockOrderService.create.mockResolvedValue(orderRecord);
    mockFormatters.formatOrder.mockReturnValue({ id: 10 });

    await createOrder(req, res);

    // subtotal 2000, sin impuesto adicional, envío mock 2500 => total 4500
    expect(mockOrderService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        totalAmount: 4500,
        taxAmount: 0,
        shippingAmount: 2500,
        starkenCodigoCiudadDestino: 98,
        shippingAddress: req.body.shippingAddress,
        paymentMethod: 'webpay'
      })
    );
    expect(mockOrderService.createOrderItems).toHaveBeenCalledWith(10, [
      { productId: 9, productName: '', quantity: 2, price: 1000 }
    ]);
    expect(mockCartService.clearCart).toHaveBeenCalledWith(5);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Orden creada exitosamente',
        data: { id: 10 }
      })
    );
  });

  it('returns 400 when the cart is empty', async () => {
    const req = {
      user: { id: 2 },
      body: { shippingAddress: {}, notes: '' }
    };
    const res = createResponseMock();

    mockValidators.validateShippingAddress.mockReturnValue({ isValid: true });
    mockCartService.findByUserId.mockResolvedValue({ id: 6, cart_items: [] });

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'El carrito está vacío. Agrega productos antes de crear una orden.'
      })
    );
    expect(mockOrderService.create).not.toHaveBeenCalled();
  });

  it('cancels paid order and triggers refund', async () => {
    const req = {
      user: { id: 3 },
      params: { orderId: '15' },
      body: { reason: 'Cambio de idea' }
    };
    const res = createResponseMock();

    mockValidators.validateOrderId.mockReturnValue({ isValid: true, orderId: 15 });
    const orderRecord = {
      id: 15,
      user_id: 3,
      status: 'pending',
      payment_status: 'paid',
      transbank_token: 'tbk-token',
      total_amount: 3000,
      order_number: 'ORD-XYZ'
    };
    mockOrderService.findById.mockResolvedValue(orderRecord);
    mockTransbankService.refundTransaction.mockResolvedValue({ status: 'REVERSED' });

    await cancelOrder(req, res);

    expect(mockTransbankService.refundTransaction).toHaveBeenCalledWith('tbk-token', 3000);
    expect(mockOrderService.updatePaymentStatus).toHaveBeenCalledWith(15, 'refunded');
    expect(mockOrderService.updateStatus).toHaveBeenCalledWith(15, 'cancelled');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          orderId: 15,
          refundProcessed: true
        })
      })
    );
  });
});

