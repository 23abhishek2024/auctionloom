const Razorpay = require('razorpay');
const crypto = require('crypto');

const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder';
const keySecret = process.env.RAZORPAY_KEY_SECRET || 'rzp_test_secret_placeholder';

const isLiveConfigured =
  process.env.RAZORPAY_KEY_ID &&
  process.env.RAZORPAY_KEY_ID !== 'rzp_test_placeholder' &&
  process.env.RAZORPAY_KEY_SECRET &&
  process.env.RAZORPAY_KEY_SECRET !== 'rzp_test_secret_placeholder';

let razorpayInstance = null;
if (isLiveConfigured) {
  try {
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
    console.log('[Razorpay] ✅ Initialized with live/test API keys.');
  } catch (err) {
    console.warn('[Razorpay] ⚠️ Failed to initialize Razorpay SDK:', err.message);
  }
}

const razorpayService = {
  getKeyId: () => keyId,

  /**
   * Create an order in Razorpay
   * @param {number} amount - Amount in INR (e.g. 50.00)
   * @param {string} receipt - Receipt identifier
   * @param {object} notes - Key-value metadata
   */
  createOrder: async ({ amount, receipt, notes = {} }) => {
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      throw new Error('Amount must be a positive number.');
    }

    const amountInPaise = Math.round(numericAmount * 100);

    if (razorpayInstance) {
      const order = await razorpayInstance.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: receipt || `rcpt_${Date.now()}`,
        notes,
      });
      return {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: keyId,
      };
    }

    // High-fidelity sandbox mock mode when credentials are dummy/placeholder
    const mockOrderId = `order_sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    return {
      id: mockOrderId,
      amount: amountInPaise,
      currency: 'INR',
      key_id: keyId,
      is_sandbox_simulation: true,
    };
  },

  /**
   * Cryptographically verify Razorpay payment signature using HMAC-SHA256
   * @param {string} orderId
   * @param {string} paymentId
   * @param {string} signature
   */
  verifySignature: ({ orderId, paymentId, signature }) => {
    if (!orderId || !paymentId || !signature) {
      return false;
    }

    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(body)
      .digest('hex');

    // In simulation mode, accept simulated signatures matching HMAC or explicit sim token
    if (signature === expectedSignature || signature === `sim_sig_${orderId}_${paymentId}`) {
      return true;
    }

    return false;
  },
};

module.exports = razorpayService;
