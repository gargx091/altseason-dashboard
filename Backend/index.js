import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import sgMail from '@sendgrid/mail';
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for your frontend domain
app.use(cors({
  origin: process.env.FRONTEND_URL || '*'
}));

// Configure SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  console.warn('SENDGRID_API_KEY not set — email alerts disabled');
}

// Helper to fetch JSON with error handling
async function fetchJSON(url, options = {}) {
  const resp = await fetch(url, options);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} - ${resp.statusText}`);
  return await resp.json();
}

// Send Email Alert
async function sendAlert(subject, text) {
  if (!process.env.ALERT_EMAIL_TO || !process.env.ALERT_EMAIL_FROM) return;
  const msg = {
    to: process.env.ALERT_EMAIL_TO,
    from: process.env.ALERT_EMAIL_FROM,
    subject,
    text
  };
  try {
    await sgMail.send(msg);
    console.log(`Alert email sent: ${subject}`);
  } catch (err) {
    console.error('Error sending email:', err.message);
  }
}

// Routes
app.get('/api/metrics/btc-dominance', async (req, res) => {
  try {
    const data = await fetchJSON('https://api.coingecko.com/api/v3/global');
    res.json({ btc_dominance: data.data.market_cap_percentage.btc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/metrics/altseason-index', (req, res) => {
  res.json({ altseason_index: 72 }); // Stub, replace with real API
});

app.get('/api/sector-leaderboard', async (req, res) => {
  try {
    const data = await fetchJSON('https://api.coingecko.com/api/v3/coins/categories');
    const sectors = data
      .map(s => ({ sector: s.name, change_24h: s.market_cap_change_24h }))
      .sort((a, b) => b.change_24h - a.change_24h)
      .slice(0, 10);
    res.json(sectors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/signals', async (req, res) => {
  try {
    const [globalData, altData] = await Promise.all([
      fetchJSON('https://api.coingecko.com/api/v3/global'),
      Promise.resolve({ altseason_index: 72 }) // Stub
    ]);

    const btcD = globalData.data.market_cap_percentage.btc;
    const asi = altData.altseason_index;

    const buy_signals = [];
    const sell_signals = [];

    if (btcD < 55 && asi > 75) {
      const signal = 'Altseason conditions met — long bias on quality alts';
      buy_signals.push(signal);
      await sendAlert('BUY Signal Triggered', signal);
    }
    if (btcD > 58 && asi < 50) {
      const signal = 'BTC dominance high — risk-off for alts';
      sell_signals.push(signal);
      await sendAlert('SELL Signal Triggered', signal);
    }

    res.json({ btc_dominance: btcD, altseason_index: asi, buy_signals, sell_signals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('Altseason 2025 Backend is running');
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
