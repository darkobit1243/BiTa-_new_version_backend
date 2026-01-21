const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/routes/auth');
const listingsRoutes = require('./src/routes/listings');
const usersRoutes = require('./src/routes/users');
const os = require('os');

const { db } = require('./src/store/db');

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
app.get('/health', (req, res) => {
  res.json({ data: { ok: true, users: db.users.length, listings: db.listings.length } });
});

app.use('/auth', authRoutes);
app.use('/listings', listingsRoutes);
app.use('/users', usersRoutes);

const port = process.env.PORT ? Number(process.env.PORT) : 8080;
const host = (process.env.HOST && String(process.env.HOST).trim()) ? String(process.env.HOST).trim() : '0.0.0.0';

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
