const sessionId = 'sess_' + Math.random().toString(36).slice(2, 10);
let catalog = [];
let cart = [];
let pendingDiscount = null;
let currentOrder = null;

const catalogEl = document.getElementById('catalog');
const cartLinesEl = document.getElementById('cart-lines');
const cartTotalEl = document.getElementById('cart-total');
const discountRowEl = document.getElementById('discount-row');
const checkoutBtn = document.getElementById('checkout-btn');
const paymentStatusEl = document.getElementById('payment-status');
const chatThread = document.getElementById('chat-thread');
const chatInput = document.getElementById('chat-text');
const chatSend = document.getElementById('chat-send');

init();

async function init() {
  const res = await fetch('/api/catalog');
  catalog = await res.json();
  renderCatalog();
  addAgentMessage("Hi! I'm your checkout concierge. Add something to your cart and I'll help you find good pairings — or just ask me about a discount.");
}

function renderCatalog() {
  catalogEl.innerHTML = '';
  catalog.forEach(p => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <span class="cat">${p.category}</span>
      <h3>${p.name}</h3>
      <span class="price">₹${p.price}</span>
      <button data-id="${p.id}">Add to cart</button>
    `;
    card.querySelector('button').addEventListener('click', () => addToCart(p));
    catalogEl.appendChild(card);
  });
}

function addToCart(product) {
  const existing = cart.find(i => i.id === product.id);
  if (existing) existing.qty += 1;
  else cart.push({ id: product.id, name: product.name, price: product.price, qty: 1 });
  renderCart();
  triggerAgentOnCartChange();
}

function renderCart() {
  if (cart.length === 0) {
    cartLinesEl.innerHTML = '<p style="opacity:0.5; font-size:13px;">Cart is empty.</p>';
    checkoutBtn.disabled = true;
    cartTotalEl.textContent = '₹0';
    discountRowEl.style.display = 'none';
    return;
  }
  cartLinesEl.innerHTML = cart.map(i =>
    `<div class="cart-line"><span>${i.name} × ${i.qty}</span><span>₹${i.price * i.qty}</span></div>`
  ).join('');

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  let total = subtotal;

  if (pendingDiscount && pendingDiscount.granted) {
    discountRowEl.style.display = 'flex';
    discountRowEl.innerHTML = `<span>Discount applied</span><span>-₹${pendingDiscount.amount}</span>`;
    total = subtotal - pendingDiscount.amount;
  } else {
    discountRowEl.style.display = 'none';
  }

  cartTotalEl.textContent = '₹' + total;
  checkoutBtn.disabled = false;
}

function addAgentMessage(text, why) {
  const div = document.createElement('div');
  div.className = 'msg agent';
  div.innerHTML = text + (why ? `<span class="why">why: ${why}</span>` : '');
  chatThread.appendChild(div);
  chatThread.scrollTop = chatThread.scrollHeight;
}

function addUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'msg user';
  div.textContent = text;
  chatThread.appendChild(div);
  chatThread.scrollTop = chatThread.scrollHeight;
}

function addSuggestionCard(action) {
  const div = document.createElement('div');
  div.className = 'suggestion-card';
  if (action.type === 'upsell_suggestion') {
    div.innerHTML = `Add <strong>${action.name}</strong> — ₹${action.price}?
      <br><button>Add to cart</button>`;
    div.querySelector('button').addEventListener('click', () => {
      addToCart({ id: action.productId, name: action.name, price: action.price, category: '' });
      div.remove();
    });
  } else if (action.type === 'discount_offer' && action.granted) {
    div.innerHTML = `Apply <strong>${action.percent}% off</strong> (₹${action.amount})?
      <br><button>Apply discount</button>`;
    div.querySelector('button').addEventListener('click', () => {
      pendingDiscount = action;
      renderCart();
      addAgentMessage(`Discount applied: ₹${action.amount} off.`, action.reason);
      div.remove();
    });
  }
  chatThread.appendChild(div);
  chatThread.scrollTop = chatThread.scrollHeight;
}

async function triggerAgentOnCartChange() {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message: '', cart })
  });
  const data = await res.json();
  if (data.action && data.action.type === 'upsell_suggestion') {
    addAgentMessage(data.reply, data.action.reason);
    addSuggestionCard(data.action);
  }
}

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  addUserMessage(text);
  chatInput.value = '';

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message: text, cart })
  });
  const data = await res.json();
  addAgentMessage(data.reply, data.action ? data.action.reason : null);
  if (data.action) addSuggestionCard(data.action);
}

chatSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

checkoutBtn.addEventListener('click', async () => {
  checkoutBtn.disabled = true;
  paymentStatusEl.innerHTML = '';

  const createRes = await fetch('/api/checkout/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: cart, applyDiscount: pendingDiscount, sessionId })
  });
  const createData = await createRes.json();
  currentOrder = createData.order;

  await tryPayment();
});

async function tryPayment(isRetry = false) {
  const endpoint = isRetry ? '/api/checkout/retry' : '/api/checkout/pay';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: currentOrder.id, sessionId })
  });
  const data = await res.json();

  if (data.success) {
    paymentStatusEl.innerHTML = `<div class="payment-status ok">✓ Payment successful — ${data.paymentId}</div>`;
    cart = [];
    pendingDiscount = null;
    renderCart();
  } else {
    paymentStatusEl.innerHTML = `
      <div class="payment-status fail">
        ✕ Payment failed: ${data.reason}
        <br><button id="retry-btn" style="margin-top:8px;">Retry payment</button>
      </div>`;
    document.getElementById('retry-btn').addEventListener('click', () => tryPayment(true));
  }
  checkoutBtn.disabled = false;
}
