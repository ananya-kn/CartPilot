// CartPilot Agent Engine
//
// This is the "brain" of the checkout concierge. It is intentionally
// RULE-BASED and BOUNDED rather than a free-form LLM agent, because the
// Buildathon bar explicitly asks for money actions that are
// "explainable, bounded and gated" with a visible audit trail.
//
// Every function here returns a plain-language `reason` string alongside
// its decision — that reason is what gets written to the audit trail and
// shown to the merchant. Nothing the agent does is a black box.
//
// Swap-in point: `explainWithLLM()` at the bottom shows where you'd plug
// a real LLM call (e.g. Claude) to turn the structured decision into a
// more natural chat reply, without changing the bounded decision logic
// itself. Decisions stay rule-based; only the *phrasing* would be LLM-generated.

const { catalog, merchant, logAudit } = require('../data/store');

function findProduct(id) {
  return catalog.find(p => p.id === id);
}

/**
 * Suggest an upsell/cross-sell based on cart contents.
 * Bounded: only ever suggests ONE item, only from `pairsWith`, only once
 * per session (enforced by caller via session.upsellAttempts).
 */
function suggestUpsell(cartItems, session) {
  if (!merchant.rules.allowUpsell) return null;
  if (session.upsellAttempts >= merchant.rules.upsellMaxAttempts) return null;

  const cartIds = cartItems.map(i => i.id);
  for (const item of cartItems) {
    const product = findProduct(item.id);
    if (!product) continue;
    const candidate = product.pairsWith.find(pid => !cartIds.includes(pid));
    if (candidate) {
      const candidateProduct = findProduct(candidate);
      session.upsellAttempts += 1;
      return {
        productId: candidateProduct.id,
        name: candidateProduct.name,
        price: candidateProduct.price,
        reason: `Customers who buy "${product.name}" often add "${candidateProduct.name}". Suggested once, within merchant upsell policy (max ${merchant.rules.upsellMaxAttempts} suggestion/session).`
      };
    }
  }
  return null;
}

/**
 * Evaluate a discount request from the customer (e.g. "can I get a discount?").
 * HARD BOUNDS enforced here — the agent can never exceed merchant.rules,
 * no matter what the customer asks for or how the request is phrased.
 */
function evaluateDiscountRequest(order, requestedPercent) {
  if (!merchant.rules.allowDiscount) {
    return { granted: false, percent: 0, amount: 0,
      reason: 'Merchant policy disables discounting for this store.' };
  }

  const cappedPercent = Math.min(
    requestedPercent || merchant.rules.maxDiscountPercent,
    merchant.rules.maxDiscountPercent
  );
  let amount = Math.round(order.subtotal * (cappedPercent / 100));
  amount = Math.min(amount, merchant.rules.maxDiscountAmount);

  return {
    granted: amount > 0,
    percent: cappedPercent,
    amount,
    reason: `Requested ${requestedPercent || 'a'}% discount. Bounded to merchant caps: ` +
      `max ${merchant.rules.maxDiscountPercent}% AND max ₹${merchant.rules.maxDiscountAmount}. ` +
      `Final discount: ₹${amount}.`
  };
}

/**
 * Simulate a payment attempt against Razorpay test-mode APIs.
 * For the demo, ~20% of attempts are made to "fail" so we can show the
 * required graceful-failure + retry flow. In a real integration this
 * would call razorpay.orders.create / razorpay.payments.capture.
 */
function attemptPayment(order) {
  const willFail = Math.random() < 0.2;
  if (willFail) {
    return {
      success: false,
      code: 'PAYMENT_DECLINED_TEST',
      reason: 'Simulated Razorpay test-mode decline (random ~20% rate, for demo of graceful failure handling).'
    };
  }
  return {
    success: true,
    paymentId: 'pay_test_' + Math.random().toString(36).slice(2, 10),
    reason: 'Razorpay test-mode payment captured successfully.'
  };
}

/**
 * Placeholder for where a real LLM (e.g. Claude via the Anthropic API)
 * would turn a structured decision object into natural chat copy.
 * Kept separate from decision logic on purpose: the LLM should only ever
 * phrase an already-bounded decision, never make the money decision itself.
 */
function explainWithLLM(decision) {
  // In production: call the Anthropic API here with `decision` as context
  // and ask for a one-sentence, friendly restatement of `decision.reason`.
  return decision.reason;
}

module.exports = {
  suggestUpsell,
  evaluateDiscountRequest,
  attemptPayment,
  explainWithLLM
};
