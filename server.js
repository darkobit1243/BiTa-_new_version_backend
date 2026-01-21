const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/routes/auth');
const listingsRoutes = require('./src/routes/listings');
const usersRoutes = require('./src/routes/users');

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
app.listen(port, () => {
  console.log(`Mock backend listening on http://localhost:${port}`);
});
