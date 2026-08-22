// In-memory data store for CartPilot demo.
// In production this would be MongoDB/Postgres — kept in-memory here so the
// project runs with zero external setup for the hackathon demo.

const { v4: uuid } = require('uuid');

const merchant = {
  id: 'merchant_1',
  name: 'Brew & Bean Roasters',
  username: 'admin',
  // demo password: cartpilot123 (hashed check done in auth route)
  passwordHash: 'cartpilot123',
  rules: {
    maxDiscountPercent: 15,      // agent can NEVER exceed this, hard bound
    maxDiscountAmount: 300,      // in INR, secondary hard bound
    allowUpsell: true,
    allowDiscount: true,
    upsellMaxAttempts: 1         // don't nag the customer
  }
};

const catalog = [
  { id: 'p1', name: 'Signature Dark Roast (250g)', price: 449, category: 'coffee', pairsWith: ['p3', 'p4'] },
  { id: 'p2', name: 'Single-Origin Ethiopian (250g)', price: 599, category: 'coffee', pairsWith: ['p3'] },
  { id: 'p3', name: 'Pour-Over Filter Papers (50pk)', price: 199, category: 'accessory', pairsWith: [] },
  { id: 'p4', name: 'Insulated Travel Mug', price: 799, category: 'accessory', pairsWith: [] },
  { id: 'p5', name: 'Cold Brew Concentrate (500ml)', price: 349, category: 'coffee', pairsWith: ['p4'] }
];

// orders: id -> order object
const orders = {};

// auditLog: append-only array of every agent decision / money action
const auditLog = [];

function logAudit(entry) {
  const record = {
    id: uuid(),
    timestamp: new Date().toISOString(),
    ...entry
  };
  auditLog.push(record);
  return record;
}

function createOrder(items) {
  const id = 'order_' + uuid().slice(0, 8);
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const order = {
    id,
    items,
    subtotal,
    discountApplied: 0,
    discountReason: null,
    total: subtotal,
    status: 'created',
    createdAt: new Date().toISOString()
  };
  orders[id] = order;
  return order;
}

module.exports = { merchant, catalog, orders, auditLog, logAudit, createOrder };
