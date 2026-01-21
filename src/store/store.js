const { createPostgresStore } = require('./postgresStore');
const { createMemoryStore } = require('./memoryStore');

function truthy(v) {
  return ['1', 'true', 'yes', 'on'].includes(String(v || '').toLowerCase());
}

function pickStore() {
  // Prefer Postgres when DATABASE_URL is provided.
  const storeKind = String(process.env.STORE || '').toLowerCase();
  const hasDatabaseUrl = Boolean(String(process.env.DATABASE_URL || '').trim());

  if (storeKind === 'postgres' || hasDatabaseUrl || truthy(process.env.USE_POSTGRES)) {
    return createPostgresStore();
  }

  return createMemoryStore();
}

const store = pickStore();

module.exports = { store };
