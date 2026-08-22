const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { catalog, merchant, orders, auditLog, logAudit, createOrder } = require('../data/store');
const agent = require('../agent/agentEngine');

const JWT_SECRET = 'cartpilot-demo-secret'; // demo only — use env var in production

// simple in-memory session store keyed by a client-generated sessionId
const sessions = {};
function getSession(sessionId) {
  if (!sessions[sessionId]) {
    sessions[sessionId] = { upsellAttempts: 0, cart: [] };
  }
  return sessions[sessionId];
}

// ---------- Public: catalog ----------
router.get('/catalog', (req, res) => {
  res.json(catalog);
});

// ---------- Public: chat with the agent ----------
router.post('/chat', (req, res) => {
  const { sessionId, message, cart } = req.body;
  const session = getSession(sessionId || 'anon');
  session.cart = cart || session.cart;

  const lower = (message || '').toLowerCase();
  let reply = '';
  let action = null;

  if (lower.includes('discount') || lower.includes('offer') || lower.includes('cheaper')) {
    const order = { subtotal: session.cart.reduce((s, i) => s + i.price * i.qty, 0) };
    const requestedMatch = lower.match(/(\d+)\s*%/);
    const requestedPercent = requestedMatch ? parseInt(requestedMatch[1], 10) : null;
    const decision = agent.evaluateDiscountRequest(order, requestedPercent);

    action = { type: 'discount_offer', ...decision };
    reply = decision.granted
      ? `I can apply a ${decision.percent}% discount (₹${decision.amount} off) on this order. Want me to apply it at checkout?`
      : `I'm not able to offer a discount on this order right now.`;

    logAudit({
      type: 'discount_evaluated',
      sessionId: sessionId || 'anon',
      requestedPercent,
      granted: decision.granted,
      amount: decision.amount,
      reason: decision.reason
    });
  } else if (session.cart.length > 0) {
    const upsell = agent.suggestUpsell(session.cart, session);
    if (upsell) {
      action = { type: 'upsell_suggestion', ...upsell };
      reply = `By the way, "${upsell.name}" (₹${upsell.price}) pairs really well with what's in your cart. Want to add it?`;
      logAudit({
        type: 'upsell_suggested',
        sessionId: sessionId || 'anon',
        productId: upsell.productId,
        reason: upsell.reason
      });
    } else {
      reply = `Happy to help — I can answer questions about your order, suggest add-ons, or check for available discounts.`;
    }
  } else {
    reply = `Hi! Add something to your cart and I can help you check out, or find you a good pairing.`;
  }

  res.json({ reply, action });
});

// ---------- Public: create order + attempt payment ----------
router.post('/checkout/create', (req, res) => {
  const { items, applyDiscount, sessionId } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Cart is empty' });

  const order = createOrder(items);

  if (applyDiscount && applyDiscount.amount > 0) {
    order.discountApplied = applyDiscount.amount;
    order.discountReason = applyDiscount.reason;
    order.total = Math.max(order.subtotal - applyDiscount.amount, 0);
    logAudit({
      type: 'discount_applied',
      sessionId: sessionId || 'anon',
      orderId: order.id,
      amount: applyDiscount.amount,
      reason: applyDiscount.reason
    });
  }

  logAudit({
    type: 'order_created',
    sessionId: sessionId || 'anon',
    orderId: order.id,
    subtotal: order.subtotal,
    total: order.total,
    reason: `Order created with ${items.length} item(s). Total after any discount: ₹${order.total}.`
  });

  res.json({ order });
});

router.post('/checkout/pay', (req, res) => {
  const { orderId, sessionId } = req.body;
  const order = orders[orderId];
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const result = agent.attemptPayment(order);

  if (result.success) {
    order.status = 'paid';
    order.paymentId = result.paymentId;
    logAudit({
      type: 'payment_success',
      sessionId: sessionId || 'anon',
      orderId,
      paymentId: result.paymentId,
      reason: result.reason
    });
    return res.json({ success: true, paymentId: result.paymentId, order });
  }

  order.status = 'payment_failed';
  logAudit({
    type: 'payment_failed',
    sessionId: sessionId || 'anon',
    orderId,
    code: result.code,
    reason: result.reason + ' Customer will be prompted to retry.'
  });
  res.json({ success: false, code: result.code, reason: result.reason, order });
});

router.post('/checkout/retry', (req, res) => {
  const { orderId, sessionId } = req.body;
  const order = orders[orderId];
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const result = agent.attemptPayment(order);
  order.status = result.success ? 'paid' : 'payment_failed';
  if (result.success) order.paymentId = result.paymentId;

  logAudit({
    type: result.success ? 'payment_retry_success' : 'payment_retry_failed',
    sessionId: sessionId || 'anon',
    orderId,
    reason: result.reason
  });

  res.json({ success: result.success, ...result, order });
});

// ---------- Merchant auth ----------
router.post('/merchant/login', (req, res) => {
  const { username, password } = req.body;
  if (username !== merchant.username || password !== merchant.passwordHash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ merchantId: merchant.id, role: 'merchant' }, JWT_SECRET, { expiresIn: '4h' });
  res.json({ token, merchant: { id: merchant.id, name: merchant.name, rules: merchant.rules } });
});

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// ---------- Merchant dashboard: audit trail + orders (JWT gated) ----------
router.get('/merchant/audit-log', requireAuth, (req, res) => {
  res.json(auditLog.slice().reverse());
});

router.get('/merchant/orders', requireAuth, (req, res) => {
  res.json(Object.values(orders).reverse());
});

router.get('/merchant/rules', requireAuth, (req, res) => {
  res.json(merchant.rules);
});

module.exports = router;
