const express = require('express');
const cors = require('cors');
const { createClient } = require('redis');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8787;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:8000';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const LAB_STATE_TTL_SECONDS = Number(process.env.LAB_STATE_TTL || 60 * 60 * 24);
const DEFAULT_LAB_STATE = {
  theme: 'light',
  tokenMode: 'words',
  selectedToken: null,
  stage: 'tokens'
};

const redis = createClient({ url: REDIS_URL });
redis.on('error', (error) => {
  console.error('[redis] connection error', error);
});

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: false
  })
);
app.use(express.json());

const getRedisKey = (sessionId) => `lab-state:${sessionId}`;

async function withRedis(handler) {
  try {
    if (!redis.isOpen) {
      await redis.connect();
    }
    return await handler(redis);
  } catch (error) {
    redis.disconnect().catch(() => {});
    throw error;
  }
}

function respondUnavailable(res, error) {
  console.error('[redis] request failed', error);
  res.status(503).json({ error: 'Lab state service unavailable' });
}

app.get('/api/lab-state/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  try {
    const payload = await withRedis((client) => client.get(getRedisKey(sessionId)));
    if (!payload) {
      return res.json({ ...DEFAULT_LAB_STATE, sessionId, persisted: false });
    }
    let parsed = {};
    try {
      parsed = JSON.parse(payload);
    } catch (error) {
      console.warn('[redis] failed to parse lab state, returning defaults', error);
    }
    return res.json({ ...DEFAULT_LAB_STATE, ...parsed, sessionId, persisted: true });
  } catch (error) {
    return respondUnavailable(res, error);
  }
});

app.post('/api/lab-state/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  const nextState = {
    ...DEFAULT_LAB_STATE,
    ...(req.body || {})
  };

  try {
    await withRedis((client) =>
      client.setEx(getRedisKey(sessionId), LAB_STATE_TTL_SECONDS, JSON.stringify(nextState))
    );
    return res.json({ ...nextState, sessionId, persisted: true });
  } catch (error) {
    return respondUnavailable(res, error);
  }
});

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Transformer Lab API listening on http://localhost:${PORT}`);
});

module.exports = { app, withRedis };
