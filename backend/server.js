const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/api', apiRoutes);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`CartPilot running at http://localhost:${PORT}`);
  console.log(`Merchant dashboard: http://localhost:${PORT}/dashboard.html`);
  console.log(`Demo merchant login -> username: admin / password: cartpilot123`);
});
