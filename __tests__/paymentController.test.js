import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const mockCartService = {
  findByUserId: jest.fn(),
  clearCart: jest.fn()
};

const mockOrderService = {
  create: jest.fn(),
  createOrderItems: jest.fn(),
  updateTransbankToken: jest.fn(),
  findById: jest.fn()
};

const mockTransbankService = {
  createTransaction: jest.fn(),
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
  validateShippingAddress: jest.fn()
};

jest.unstable_mockModule('../utils/validators.js', () => mockValidators);

const mockAuthHelper = {
  requireAuth: jest.fn()
};

jest.unstable_mockModule('../utils/authHelper.js', () => mockAuthHelper);

const mockCreateOrderFromCart = jest.fn();

jest.unstable_mockModule('../controllers/orderController.js', () => ({
  createOrderFromCart: (...args) => mockCreateOrderFromCart(...args)
}));

jest.unstable_mockModule('../utils/starkenService.js', () => ({
  isStarkenConfigured: jest.fn(() => true)
}));

let initiatePayment;
let refundPayment;
beforeAll(async () => {
  const controller = await import('../controllers/paymentController.js');
  initiatePayment = controller.initiatePayment;
  refundPayment = controller.refundPayment;
});

const createResponseMock = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('paymentController', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthHelper.requireAuth.mockReturnValue(true);
    mockCreateOrderFromCart.mockReset();
  });

  afterEach(() => {
    process.env.FRONTEND_URL = originalFrontendUrl;
  });

  it('initiates payment when cart has items and FRONTEND_URL is set', async () => {
    process.env.FRONTEND_URL = 'https://frontend.example.com';
    const req = {
      user: { id: 99 },
      body: {
        shippingAddress: { street: 'x', city: 'y', state: 'z', zipCode: '1', country: 'CL' },
        codigoCiudadDestino: 98,
        clientShippingAmount: 0
      }
    };
    const res = createResponseMock();

    mockValidators.validateShippingAddress.mockReturnValue({ isValid: true });
    const newOrder = { id: 55, order_number: 'ORD-55', total_amount: 5400 };
    mockCreateOrderFromCart.mockResolvedValue(newOrder);
    mockTransbankService.createTransaction.mockResolvedValue({
      url: 'https://tbk.example.com/pay',
      token: 'TBK123'
    });

    await initiatePayment(req, res);

    expect(mockCreateOrderFromCart).toHaveBeenCalled();
    expect(mockOrderService.updateTransbankToken).toHaveBeenCalledWith(55, 'TBK123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          orderId: 55,
          transbankUrl: 'https://tbk.example.com/pay?token_ws=TBK123'
        })
      })
    );
  });

  it('returns server error when FRONTEND_URL is missing', async () => {
    delete process.env.FRONTEND_URL;
    const req = {
      user: { id: 1 },
      body: {
        shippingAddress: { street: 'x', city: 'y', state: 'z', zipCode: '1', country: 'CL' },
        codigoCiudadDestino: 98,
        clientShippingAmount: 0
      }
    };
    const res = createResponseMock();

    mockCreateOrderFromCart.mockResolvedValue({
      id: 1,
      order_number: 'ORD-X',
      total_amount: 1000
    });

    await initiatePayment(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Error de configuración: FRONTEND_URL no está configurado'
      })
    );
    expect(mockCreateOrderFromCart).toHaveBeenCalledTimes(1);
    expect(mockTransbankService.createTransaction).not.toHaveBeenCalled();
  });

  it('returns 400 when trying to refund an order without transaction token', async () => {
    const req = {
      user: { id: 3 },
      params: { orderId: '77' },
      body: {}
    };
    const res = createResponseMock();

    mockOrderService.findById.mockResolvedValue({
      id: 77,
      transbank_token: null
    });

    await refundPayment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Esta orden no tiene una transacción de Transbank.'
      })
    );
    expect(mockTransbankService.refundTransaction).not.toHaveBeenCalled();
  });
});

