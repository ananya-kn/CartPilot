let token = null;

const loginView = document.getElementById('login-view');
const dashView = document.getElementById('dash-view');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');

loginBtn.addEventListener('click', async () => {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  const res = await fetch('/api/merchant/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (!res.ok) {
    loginError.textContent = 'Invalid credentials.';
    return;
  }
  const data = await res.json();
  token = data.token;
  loginView.style.display = 'none';
  dashView.style.display = 'block';
  loadDashboard();
  setInterval(loadDashboard, 4000);
});

async function authFetch(url) {
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  return res.json();
}

async function loadDashboard() {
  const [auditLog, orders, rules] = await Promise.all([
    authFetch('/api/merchant/audit-log'),
    authFetch('/api/merchant/orders'),
    authFetch('/api/merchant/rules')
  ]);
  renderStats(auditLog, orders);
  renderTape(auditLog);
  renderRules(rules);
}

function renderStats(auditLog, orders) {
  const paidOrders = orders.filter(o => o.status === 'paid');
  const revenue = paidOrders.reduce((s, o) => s + o.total, 0);
  const discounts = orders.reduce((s, o) => s + (o.discountApplied || 0), 0);
  const failures = auditLog.filter(a => a.type === 'payment_failed').length;

  document.getElementById('stat-orders').textContent = orders.length;
  document.getElementById('stat-revenue').textContent = '₹' + revenue;
  document.getElementById('stat-discount').textContent = '₹' + discounts;
  document.getElementById('stat-failed').textContent = failures;
}

const typeLabels = {
  order_created: 'Order created',
  discount_evaluated: 'Discount evaluated',
  discount_applied: 'Discount applied',
  upsell_suggested: 'Upsell suggested',
  payment_success: 'Payment success',
  payment_failed: 'Payment failed',
  payment_retry_success: 'Retry succeeded',
  payment_retry_failed: 'Retry failed'
};

function renderTape(auditLog) {
  const tape = document.getElementById('tape');
  if (auditLog.length === 0) {
    tape.innerHTML = '<div class="tape-row"><span></span><span></span><span class="reason">No activity yet — try the storefront at <a href="/">/</a>.</span></div>';
    return;
  }
  tape.innerHTML = auditLog.map(entry => {
    const failClass = entry.type.includes('fail') ? 'fail' : '';
    const time = new Date(entry.timestamp).toLocaleTimeString();
    return `
      <div class="tape-row">
        <span class="ts">${time}</span>
        <span class="type ${failClass}">${typeLabels[entry.type] || entry.type}</span>
        <span class="reason">${entry.reason || ''}</span>
      </div>`;
  }).join('');
}

function renderRules(rules) {
  document.getElementById('rules').innerHTML = `
    max_discount_percent: ${rules.maxDiscountPercent}%<br>
    max_discount_amount: ₹${rules.maxDiscountAmount}<br>
    allow_upsell: ${rules.allowUpsell}<br>
    allow_discount: ${rules.allowDiscount}<br>
    upsell_max_attempts_per_session: ${rules.upsellMaxAttempts}
  `;
}
