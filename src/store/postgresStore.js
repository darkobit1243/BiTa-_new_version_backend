const { Pool } = require('pg');

function truthy(v) {
  return ['1', 'true', 'yes', 'on'].includes(String(v || '').toLowerCase());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapUserRow(row) {
  if (!row) return null;
  return {
    userId: String(row.user_id),
    email: row.email,
    name: row.name,
    role: row.role,
    isPremium: Boolean(row.is_premium),
    providerServiceType: row.provider_service_type,
    approvalStatus: row.approval_status || 'pending',
    approvalReason: row.approval_reason || null,
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

function mapUserAuthRow(row) {
  const user = mapUserRow(row);
  if (!user) return null;
  return {
    ...user,
    passwordHash: row.password_hash || null,
    resetTokenHash: row.reset_token_hash || null,
    resetTokenExpiresAt: row.reset_token_expires_at ? new Date(row.reset_token_expires_at).toISOString() : null,
  };
}

function mapListingRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    ownerId: row.owner_id,
    ownerRole: row.owner_role,
    title: row.title,
    adType: row.ad_type,
    serviceType: row.service_type,
    originCityId: row.origin_city_id,
    originCityName: row.origin_city_name,
    originDistrictId: row.origin_district_id,
    originDistrictName: row.origin_district_name,
    destinationCityId: row.destination_city_id,
    destinationCityName: row.destination_city_name,
    destinationDistrictId: row.destination_district_id,
    destinationDistrictName: row.destination_district_name,
    date: row.date ? new Date(row.date).toISOString() : null,
    cargoType: row.cargo_type,
    weight: row.weight,
    providerId: row.provider_id,
    providerCompanyName: row.provider_company_name,
    notes: row.notes,
    isBoosted: Boolean(row.is_boosted),
  };
}

function mapOfferRow(row) {
  if (!row) return null;
  const offerId = Number(row.offer_id);
  return {
    offerId,
    id: String(offerId),
    listingId: String(row.listing_id),
    providerId: row.provider_id,
    companyName: row.company_name,
    phone: row.phone,
    email: row.email,
    providerCity: row.provider_city,
    providerDistrict: row.provider_district,
    price: row.price === null ? null : Number(row.price),
    rating: row.rating === null ? null : Number(row.rating),
    reviewCount: row.review_count === null ? null : Number(row.review_count),
    yearsInBusiness: row.years_in_business === null ? null : Number(row.years_in_business),
    vehicleCount: row.vehicle_count === null ? null : Number(row.vehicle_count),
    isUnlocked: false,
  };
}

async function runMigrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      is_premium BOOLEAN NOT NULL DEFAULT false,
      provider_service_type TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS listings (
      id BIGSERIAL PRIMARY KEY,
      owner_id TEXT NOT NULL,
      owner_role TEXT NOT NULL,
      title TEXT NOT NULL,
      ad_type TEXT NOT NULL,
      service_type TEXT NOT NULL,
      origin_city_id INTEGER NULL,
      origin_city_name TEXT NOT NULL,
      origin_district_id INTEGER NULL,
      origin_district_name TEXT NULL,
      destination_city_id INTEGER NULL,
      destination_city_name TEXT NOT NULL,
      destination_district_id INTEGER NULL,
      destination_district_name TEXT NULL,
      date TIMESTAMPTZ NOT NULL,
      cargo_type TEXT NOT NULL,
      weight TEXT NOT NULL,
      provider_id TEXT NULL,
      provider_company_name TEXT NULL,
      notes TEXT NULL,
      is_boosted BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS offers (
      offer_id SERIAL PRIMARY KEY,
      listing_id BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      provider_id TEXT NOT NULL,
      company_name TEXT NOT NULL,
      phone TEXT NULL,
      email TEXT NULL,
      provider_city TEXT NULL,
      provider_district TEXT NULL,
      price NUMERIC NULL,
      rating NUMERIC NULL,
      review_count INTEGER NULL,
      years_in_business INTEGER NULL,
      vehicle_count INTEGER NULL
    );

    CREATE TABLE IF NOT EXISTS unlocked_offers (
      user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      offer_id INTEGER NOT NULL REFERENCES offers(offer_id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY(user_id, offer_id)
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_reason TEXT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash TEXT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ NULL;
  `);
}

function createPostgresStore() {
  const connectionString = String(process.env.DATABASE_URL || '').trim();
  if (!connectionString) {
    throw new Error('Postgres store selected but DATABASE_URL is empty.');
  }

  const max = Number(process.env.PG_POOL_MAX || 10);
  const idleTimeoutMillis = Number(process.env.PG_IDLE_TIMEOUT_MS || 30000);
  const connectionTimeoutMillis = Number(process.env.PG_CONN_TIMEOUT_MS || 5000);

  const pool = new Pool({
    connectionString,
    ssl: truthy(process.env.PGSSL) ? { rejectUnauthorized: false } : undefined,
    max: Number.isFinite(max) && max > 0 ? max : 10,
    idleTimeoutMillis: Number.isFinite(idleTimeoutMillis) && idleTimeoutMillis >= 0 ? idleTimeoutMillis : 30000,
    connectionTimeoutMillis: Number.isFinite(connectionTimeoutMillis) && connectionTimeoutMillis >= 0 ? connectionTimeoutMillis : 5000,
    keepAlive: truthy(process.env.PG_KEEPALIVE) ? true : undefined,
  });

  // IMPORTANT: Without an 'error' handler, some pg pool errors can crash the process.
  pool.on('error', (err) => {
    console.error('[pg] pool error (idle client):', err);
  });

  const store = {
    async init() {
      const retries = Number(process.env.PG_INIT_RETRIES || 12);
      const delayMs = Number(process.env.PG_INIT_DELAY_MS || 2500);

      let lastErr = null;
      for (let attempt = 1; attempt <= Math.max(1, retries); attempt++) {
        try {
          await runMigrations(pool);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          const msg = String(e && e.message ? e.message : e);
          console.warn(`[pg] migrations failed (attempt ${attempt}/${retries}): ${msg}`);
          if (attempt < retries) {
            await sleep(Number.isFinite(delayMs) ? delayMs : 2500);
          }
        }
      }

      if (lastErr) {
        throw lastErr;
      }

      // Seed demo data once if empty
      const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM listings');
      const count = rows[0]?.c || 0;
      if (count === 0) {
        const demoUser = await store.createUser({
          email: 'demo@bitasi.app',
          name: 'Demo Kullanıcı',
          role: 'seeker',
          isPremium: false,
          providerServiceType: null,
        });

        await store.createListing({
          ownerId: demoUser.email,
          ownerRole: 'seeker',
          title: 'İstanbul → Ankara Parsiyel',
          adType: 'cargo',
          serviceType: 'transport',
          originCityId: 34,
          originCityName: 'İstanbul',
          originDistrictId: 1,
          originDistrictName: 'Kadıköy',
          destinationCityId: 6,
          destinationCityName: 'Ankara',
          destinationDistrictId: 1,
          destinationDistrictName: 'Çankaya',
          date: new Date().toISOString(),
          cargoType: 'Palet',
          weight: '1000',
          providerId: null,
          providerCompanyName: null,
          notes: null,
          isBoosted: false,
        });
      }
    },

    async stats() {
      const u = await pool.query('SELECT COUNT(*)::int AS c FROM users');
      const l = await pool.query('SELECT COUNT(*)::int AS c FROM listings');
      return { users: u.rows[0]?.c || 0, listings: l.rows[0]?.c || 0 };
    },

    async findUserByEmail(email, { includeAuth } = {}) {
      const { rows } = await pool.query('SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1', [String(email)]);
      return includeAuth ? mapUserAuthRow(rows[0]) : mapUserRow(rows[0]);
    },

    async createUser({ email, name, role, isPremium, providerServiceType, approvalStatus, passwordHash }) {
      const { rows } = await pool.query(
        `INSERT INTO users (email, name, role, is_premium, provider_service_type, approval_status, password_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [
          String(email),
          String(name),
          String(role),
          Boolean(isPremium),
          providerServiceType || null,
          approvalStatus ? String(approvalStatus) : 'pending',
          passwordHash ? String(passwordHash) : null,
        ],
      );
      return mapUserRow(rows[0]);
    },

    async setUserPassword({ userId, passwordHash }) {
      const { rows } = await pool.query(
        `UPDATE users
         SET password_hash=$2, updated_at=now()
         WHERE user_id=$1
         RETURNING *`,
        [Number(userId), passwordHash ? String(passwordHash) : null],
      );
      return mapUserRow(rows[0]);
    },

    async setUserResetToken({ userId, resetTokenHash, resetTokenExpiresAt }) {
      const { rows } = await pool.query(
        `UPDATE users
         SET reset_token_hash=$2,
             reset_token_expires_at=$3,
             updated_at=now()
         WHERE user_id=$1
         RETURNING *`,
        [
          Number(userId),
          resetTokenHash ? String(resetTokenHash) : null,
          resetTokenExpiresAt ? new Date(resetTokenExpiresAt).toISOString() : null,
        ],
      );
      return mapUserRow(rows[0]);
    },

    async clearUserResetToken({ userId }) {
      const { rows } = await pool.query(
        `UPDATE users
         SET reset_token_hash=NULL,
             reset_token_expires_at=NULL,
             updated_at=now()
         WHERE user_id=$1
         RETURNING *`,
        [Number(userId)],
      );
      return mapUserRow(rows[0]);
    },

    async listUsers({ status } = {}) {
      const params = [];
      const where = [];
      if (status) {
        params.push(String(status));
        where.push(`approval_status = $${params.length}`);
      }

      const sql = `SELECT * FROM users ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY user_id DESC LIMIT 200`;
      const { rows } = await pool.query(sql, params);
      return rows.map(mapUserRow);
    },

    async setUserApproval({ userId, status, reason }) {
      const finalStatus = String(status);
      if (!['pending', 'approved', 'rejected'].includes(finalStatus)) {
        throw new Error('invalid status');
      }

      const { rows } = await pool.query(
        `UPDATE users
         SET approval_status=$2,
             approval_reason=$3,
             approved_at = CASE WHEN $2='approved' THEN now() ELSE NULL END,
             updated_at = now()
         WHERE user_id=$1
         RETURNING *`,
        [Number(userId), finalStatus, reason ? String(reason) : null],
      );

      const user = mapUserRow(rows[0]);
      if (!user) throw new Error('user not found');
      return user;
    },

    async createListing(payload) {
      const listingInsert = await pool.query(
        `INSERT INTO listings (
          owner_id, owner_role, title, ad_type, service_type,
          origin_city_id, origin_city_name, origin_district_id, origin_district_name,
          destination_city_id, destination_city_name, destination_district_id, destination_district_name,
          date, cargo_type, weight,
          provider_id, provider_company_name, notes, is_boosted
        ) VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,$8,$9,
          $10,$11,$12,$13,
          $14,$15,$16,
          $17,$18,$19,$20
        ) RETURNING *`,
        [
          payload.ownerId,
          payload.ownerRole,
          payload.title,
          payload.adType,
          payload.serviceType,
          payload.originCityId ?? null,
          payload.originCityName,
          payload.originDistrictId ?? null,
          payload.originDistrictName ?? null,
          payload.destinationCityId ?? null,
          payload.destinationCityName,
          payload.destinationDistrictId ?? null,
          payload.destinationDistrictName ?? null,
          new Date(payload.date).toISOString(),
          payload.cargoType,
          String(payload.weight),
          payload.providerId ?? null,
          payload.providerCompanyName ?? null,
          payload.notes ?? null,
          Boolean(payload.isBoosted),
        ],
      );

      const listing = mapListingRow(listingInsert.rows[0]);

      // Seed offers
      const originCityName = payload.originCityName || 'İstanbul';
      const seed = [
        {
          providerId: 'provider_1',
          companyName: 'Express Logistics Ltd.',
          phone: '+90 532 123 4567',
          email: 'contact@expresslogistics.example',
          providerCity: originCityName,
          providerDistrict: 'Kadıköy',
          price: 4500,
          rating: 4.8,
          reviewCount: 127,
          yearsInBusiness: 12,
          vehicleCount: 45,
        },
        {
          providerId: 'provider_2',
          companyName: 'Hızlı Taşıma A.Ş.',
          phone: '+90 533 987 6543',
          email: 'info@hizlitasima.example',
          providerCity: originCityName,
          providerDistrict: 'Pendik',
          price: 4750,
          rating: 4.6,
          reviewCount: 86,
          yearsInBusiness: 7,
          vehicleCount: null,
        },
        {
          providerId: 'provider_3',
          companyName: 'Marmara Nakliyat',
          phone: '+90 536 222 1122',
          email: 'sales@marmaranakliyat.example',
          providerCity: payload.originCityName || 'Kocaeli',
          providerDistrict: 'Gebze',
          price: 5100,
          rating: 4.9,
          reviewCount: 210,
          yearsInBusiness: null,
          vehicleCount: 18,
        },
      ];

      for (const o of seed) {
        await pool.query(
          `INSERT INTO offers (
            listing_id, provider_id, company_name, phone, email,
            provider_city, provider_district, price, rating,
            review_count, years_in_business, vehicle_count
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            Number(listing.id),
            o.providerId,
            o.companyName,
            o.phone,
            o.email,
            o.providerCity,
            o.providerDistrict,
            o.price,
            o.rating,
            o.reviewCount,
            o.yearsInBusiness,
            o.vehicleCount,
          ],
        );
      }

      return listing;
    },

    async listFeed({ serviceType, adType, originCityId, destinationCityId }) {
      const where = [];
      const params = [];

      if (serviceType) {
        params.push(String(serviceType));
        where.push(`service_type = $${params.length}`);
      }
      if (adType) {
        params.push(String(adType));
        where.push(`ad_type = $${params.length}`);
      }
      if (originCityId) {
        params.push(Number(originCityId));
        where.push(`origin_city_id = $${params.length}`);
      }
      if (destinationCityId) {
        params.push(Number(destinationCityId));
        where.push(`destination_city_id = $${params.length}`);
      }

      const sql = `SELECT * FROM listings ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC`;
      const { rows } = await pool.query(sql, params);
      return rows.map(mapListingRow);
    },

    async getOffersForListing(listingId) {
      const { rows } = await pool.query('SELECT * FROM offers WHERE listing_id=$1 ORDER BY offer_id ASC', [Number(listingId)]);
      return rows.map(mapOfferRow);
    },

    async getUnlockedOfferIds(userId) {
      const { rows } = await pool.query('SELECT offer_id FROM unlocked_offers WHERE user_id=$1 ORDER BY offer_id ASC', [Number(userId)]);
      return rows.map((r) => Number(r.offer_id));
    },

    async unlockOffer(userId, offerId) {
      await pool.query(
        'INSERT INTO unlocked_offers (user_id, offer_id) VALUES ($1,$2) ON CONFLICT (user_id, offer_id) DO NOTHING',
        [Number(userId), Number(offerId)],
      );
    },

    async dump() {
      // Intentionally minimal for security; use SQL clients for full inspection.
      const stats = await store.stats();
      return { meta: { store: 'postgres' }, stats };
    },
  };

  return store;
}

module.exports = { createPostgresStore };
