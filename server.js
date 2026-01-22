const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/routes/auth');
const listingsRoutes = require('./src/routes/listings');
const usersRoutes = require('./src/routes/users');
const adminRoutes = require('./src/routes/admin');
const os = require('os');

const { store } = require('./src/store/store');
const { requireAdmin } = require('./src/middleware/adminAuth');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Optional request logging for manual end-to-end validation.
// Enable with: LOG_REQUESTS=true node server.js
if (String(process.env.LOG_REQUESTS || '').toLowerCase() === 'true') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
  });
}

// Debug endpoint
app.get(['/health', '/api/health'], (req, res) => {
  Promise.resolve()
    .then(async () => {
      let meta = { store: 'unknown' };
      let stats = null;
      let dbOk = false;
      let error = null;

      try {
        if (store && typeof store.dump === 'function') {
          const dumped = await store.dump();
          if (dumped && dumped.meta) meta = dumped.meta;
          if (dumped && dumped.stats) stats = dumped.stats;
          dbOk = true;
        } else if (store && typeof store.stats === 'function') {
          stats = await store.stats();
          dbOk = true;
        }
      } catch (e) {
        error = String(e && e.message ? e.message : e);
        dbOk = false;
      }

      return res.json({
        data: {
          ok: true,
          dbOk,
          meta,
          ...(stats || {}),
          ...(error ? { error } : {}),
        },
      });
    })
    .catch(() => res.json({ data: { ok: true, dbOk: false, meta: { store: 'unknown' } } }));
});

// Minimal identity endpoint for admin panel.
// If ADMIN_TOKEN is set, requires Authorization: Bearer <ADMIN_TOKEN>
app.get(['/me', '/api/me'], requireAdmin, (req, res) => {
  res.json({ data: { ok: true, isAdmin: true } });
});

app.get('/me', requireAdmin, (req, res) => {
  res.json({ data: { ok: true, isAdmin: true } });
});

// Optional debug endpoint (disabled by default).
// Enable with: ENABLE_DEBUG_ENDPOINTS=true
// Optional auth: DEBUG_TOKEN=some-secret + header: x-debug-token: some-secret
if (['1', 'true', 'yes', 'on'].includes(String(process.env.ENABLE_DEBUG_ENDPOINTS || '').toLowerCase())) {
  const debugToken = String(process.env.DEBUG_TOKEN || '').trim();

  app.get('/debug/db', (req, res) => {
    if (debugToken) {
      const provided = String(req.get('x-debug-token') || '').trim();
      if (provided !== debugToken) {
        return res.status(401).json({ data: { error: 'unauthorized' } });
      }
    }
    return Promise.resolve(store.dump ? store.dump() : { meta: { store: 'unknown' } })
      .then((data) => res.json({ data }))
      .catch((err) => res.status(500).json({ data: { error: 'failed', message: String(err && err.message ? err.message : err) } }));
  });
}

app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);

app.use('/listings', listingsRoutes);
app.use('/api/listings', listingsRoutes);

app.use('/users', usersRoutes);
app.use('/api/users', usersRoutes);

app.use('/admin', adminRoutes);
app.use('/api/admin', adminRoutes);

const port = process.env.PORT ? Number(process.env.PORT) : 8080;
const host = (process.env.HOST && String(process.env.HOST).trim()) ? String(process.env.HOST).trim() : '0.0.0.0';

async function start() {
  if (store && typeof store.init === 'function') {
    await store.init();
  }

  const server = app.listen(port, host, () => {
    console.log(`Mock backend listening on http://${host}:${port}`);

  // 0.0.0.0 means "bind all interfaces" (good for VPS). You don't browse to 0.0.0.0.
  if (host === '0.0.0.0') {
    console.log(`Local test: http://localhost:${port}/health`);

    try {
      const nets = os.networkInterfaces();
      const ips = [];
      for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
          if (net && net.family === 'IPv4' && !net.internal) {
            ips.push(net.address);
          }
        }
      }

      if (ips.length) {
        console.log('LAN/VPS interface URLs:');
        for (const ip of ips) {
          console.log(`- http://${ip}:${port}/health`);
        }
      }
    } catch (_) {
      // ignore
    }
  }
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use on ${host}.`);
      console.error('Stop the existing process, or run with a different port, e.g.:');
      console.error('  PORT=8081 node server.js');
    } else {
      console.error('Server failed to start:', err);
    }
    process.exit(1);
  });
}

start().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
