# CartPilot — AI Checkout Concierge for Razorpay Merchants

**Razorpay AI Buildathon 2026 — Track 1: AI Growth & Agentic Commerce**

CartPilot is a conversational AI agent embedded in a merchant's checkout flow.
It recommends relevant upsells, negotiates a **bounded, merchant-capped**
discount when a customer hesitates, and completes payment end-to-end on
**Razorpay test-mode APIs** — with every money-relevant decision written to
an explainable, timestamped audit trail before it's allowed to take effect.

## Problem it solves

Merchants lose revenue in two silent ways: missed upsell opportunities, and
customers who abandon checkout instead of asking for a small nudge to
convert. A human sales rep would catch both — CartPilot puts that same
behavior in front of every customer, while keeping every action explainable,
bounded, and gated so a merchant can trust an AI to touch their checkout.

## The three guardrails (the Buildathon's stated bar)

| Requirement | How CartPilot meets it |
|---|---|
| **Explainable** | Every agent decision (`lib/agent.js`) returns a structured object with a human-readable `reason` — never a bare number. |
| **Bounded** | Discounts are capped by `MAX_DISCOUNT_PERCENT` (merchant-configured env var). The cap is enforced **server-side** in `checkout.js` via `clampDiscountPercent()` — a tampered client request claiming a bigger discount is silently clamped back down, not trusted. |
| **Gated** | The agent (`/api/chat`) only ever *proposes* an action. The only code path that can actually create a Razorpay order is `/api/checkout`, and every proposal + every order is written to the audit trail (`lib/auditStore.js`) first. |

## Failure handling (graceful, not silent)

`pages/api/webhook.js` listens for Razorpay's `payment.failed` event and:
1. Logs the failure with a reason.
2. Proposes a retry to the customer — up to `MAX_AUTO_RETRY_ATTEMPTS` (default 2), so it never retries indefinitely.
3. After the cap is hit, logs `PAYMENT_ABANDONED` and stops, instead of quietly dropping the customer.

## Architecture

```
Customer (browser)
   │
   ├── chats with the agent ───► POST /api/chat ───► lib/agent.js (decideAction)
   │                                    │                    │
   │                                    └──────────► lib/auditStore.js (log proposal)
   │
   ├── accepts upsell / discount (client-side cart update)
   │
   └── clicks "Pay" ───► POST /api/checkout
                              │
                              ├── clampDiscountPercent() [re-validates against cap]
                              ├── razorpay.orders.create() [test mode]
                              └── lib/auditStore.js (log order + reasoning)
                                       │
                          Razorpay Checkout.js widget opens
                                       │
                              payment succeeds / fails
                                       │
                          Razorpay → POST /api/webhook
                                       │
                              log PAYMENT_SUCCEEDED
                              or RETRY_PROPOSED → ... → PAYMENT_ABANDONED

Merchant (browser)
   │
   ├── POST /api/login ───► lib/auth.js issues JWT
   │
   └── GET /api/dashboard, /api/audit (JWT-gated) ───► full audit trail table
```

## Tech stack

- **Next.js 14** (pages router) + React — frontend chat/checkout UI and merchant dashboard
- **Razorpay Node SDK** — test-mode order creation + Checkout.js widget
- **JWT (jsonwebtoken)** — merchant dashboard auth, same pattern as role-gated access used in prior projects
- **JSON file audit store** (`data/audit-log.json`) — swappable for Postgres/Mongo without changing calling code

## Running locally

```bash
npm install
cp .env.example .env.local   # add your Razorpay TEST key id/secret
npm run dev
```

Open `http://localhost:3000` for the storefront demo, and
`http://localhost:3000/dashboard` for the merchant audit trail
(demo login: `merchant` / `demo1234`).

To simulate a payment: use Razorpay's documented test cards — `4111 1111
1111 1111` (any future expiry/CVV) succeeds; their documented failure test
card triggers the graceful-retry flow described above.

## What's deliberately out of scope for this demo

- Real merchant catalog ingestion (uses a small hardcoded catalog in `lib/agent.js` to keep the demo self-contained)
- Production-grade auth (real merchant OAuth instead of the demo login)
- A real ML-based upsell model — the current rule-based "frequently bought together" logic is intentionally simple so the *bounded/explainable/gated* architecture stays the focus, per the track's stated bar.

## Track alignment

Built for **Track 1: AI Growth & Agentic Commerce** — an agent that grows a
merchant's revenue on Razorpay test-mode APIs, with every money action
explainable, bounded, and gated, and one failure (payment decline) handled
gracefully via a capped retry flow.
# CartPilot
