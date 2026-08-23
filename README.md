
# CartPilot
 
AI checkout concierge for Razorpay merchants — built for the Razorpay AI Buildathon 2026, Track 1 (AI Growth & Agentic Commerce).
 
Live demo: https://cartpilot-64yn.onrender.com
Merchant dashboard: https://cartpilot-64yn.onrender.com/dashboard.html (login: admin / cartpilot123)
 
Note: hosted on Render's free tier, so the first request after a period of inactivity can take 30-50 seconds to respond.
 
## What it does
 
CartPilot is a chat-based agent that sits inside a merchant's checkout flow. As a customer shops, it suggests relevant add-ons based on what's already in the cart, and can evaluate discount requests — but only within limits the merchant has set. It never grants more than it's allowed to, no matter how the request is phrased. Every suggestion, discount, and payment attempt gets written to an audit trail the merchant can see in real time, along with the reason behind it.
 
The goal was to make an agent that's actually useful without handing it unchecked control over pricing or discounts.
 
## How it's built
 
The agent logic is rule-based rather than a free-form LLM call. Given that money is involved, I wanted every decision to be traceable back to a specific rule, not something generated on the fly. Discounts are capped server-side (currently 15% or ₹300, whichever is lower), and those limits aren't something the agent can talk its way around.
 
```
backend/
  server.js              Express app entry point
  routes/api.js          Chat, checkout, auth, and audit endpoints
  agent/agentEngine.js   Decision logic for upsells, discounts, payments
  data/store.js          In-memory catalog, orders, audit log
public/
  index.html, app.js         Storefront and chat UI
  dashboard.html, dashboard.js   Merchant dashboard (JWT-protected)
```
 
Payments are simulated to mirror how Razorpay's test-mode API would behave, including a deliberate failure rate so the checkout flow has to handle a declined payment and retry, not just the happy path.
 
## Running it locally
 
```
git clone https://github.com/ananya-kn/CartPilot.git
cd CartPilot
npm install
npm start
```
 
Storefront runs on localhost:3000, dashboard on localhost:3000/dashboard.html.
 
## Stack
 
Node.js, Express, JWT for the merchant login, vanilla JS on the frontend — no framework overhead for what's essentially a chat widget and a dashboard.

