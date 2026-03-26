import express from 'express';
import { getShippingDestinations, postShippingQuote } from '../controllers/shippingController.js';

const router = express.Router();

router.get('/destinations', getShippingDestinations);
router.post('/quote', postShippingQuote);

export default router;
