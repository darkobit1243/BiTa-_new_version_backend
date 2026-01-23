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
    status: row.status || 'pending',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    acceptedAt: row.accepted_at ? new Date(row.accepted_at).toISOString() : null,
    acceptedBy: row.accepted_by || null,
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

    ALTER TABLE offers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE offers ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ NULL;
    ALTER TABLE offers ADD COLUMN IF NOT EXISTS accepted_by TEXT NULL;
    ALTER TABLE offers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
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

      // No demo seeding: production behavior is user-driven.
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
      return listing;
    },

    async getListingById(listingId) {
      const { rows } = await pool.query('SELECT * FROM listings WHERE id=$1 LIMIT 1', [Number(listingId)]);
      return mapListingRow(rows[0]);
    },

    async getOfferById(listingId, offerId) {
      const { rows } = await pool.query(
        'SELECT * FROM offers WHERE offer_id=$1 AND listing_id=$2 LIMIT 1',
        [Number(offerId), Number(listingId)],
      );
      return mapOfferRow(rows[0]);
    },

    async getUserById(userId) {
      const { rows } = await pool.query('SELECT * FROM users WHERE user_id=$1 LIMIT 1', [Number(userId)]);
      return mapUserRow(rows[0]);
    },

    async createOffer(payload) {
      const listingId = Number(payload.listingId);
      if (!Number.isFinite(listingId) || listingId <= 0) {
        throw new Error('invalid listingId');
      }

      const listing = await store.getListingById(listingId);
      if (!listing) {
        const err = new Error('listing not found');
        err.status = 404;
        throw err;
      }

      const { rows } = await pool.query(
        `INSERT INTO offers (
          listing_id, provider_id, company_name, phone, email,
          provider_city, provider_district, price, rating,
          review_count, years_in_business, vehicle_count
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *`,
        [
          listingId,
          String(payload.providerId),
          String(payload.companyName),
          payload.phone ? String(payload.phone) : null,
          payload.email ? String(payload.email) : null,
          payload.providerCity ? String(payload.providerCity) : null,
          payload.providerDistrict ? String(payload.providerDistrict) : null,
          payload.price === undefined || payload.price === null ? null : Number(payload.price),
          payload.rating === undefined || payload.rating === null ? null : Number(payload.rating),
          payload.reviewCount === undefined || payload.reviewCount === null ? null : Number(payload.reviewCount),
          payload.yearsInBusiness === undefined || payload.yearsInBusiness === null ? null : Number(payload.yearsInBusiness),
          payload.vehicleCount === undefined || payload.vehicleCount === null ? null : Number(payload.vehicleCount),
        ],
      );

      return mapOfferRow(rows[0]);
    },

    async acceptOffer({ listingId, offerId, ownerId, unlockNow = true }) {
      const listing = await store.getListingById(listingId);
      if (!listing) {
        const err = new Error('listing not found');
        err.status = 404;
        throw err;
      }

      if (String(listing.ownerId) !== String(ownerId)) {
        const err = new Error('forbidden');
        err.status = 403;
        throw err;
      }

      const { rows } = await pool.query(
        `UPDATE offers
         SET status='accepted', accepted_at=now(), accepted_by=$3
         WHERE offer_id=$1 AND listing_id=$2
         RETURNING *`,
        [Number(offerId), Number(listingId), String(ownerId)],
      );

      const offer = mapOfferRow(rows[0]);
      if (!offer) {
        const err = new Error('offer not found');
        err.status = 404;
        throw err;
      }

      if (unlockNow) {
        // Payment/unlock flow is bypassed for now.
        const ownerIdNum = Number(ownerId);
        const providerIdNum = Number(offer.providerId);
        if (Number.isFinite(ownerIdNum) && ownerIdNum > 0) {
          await store.unlockOffer(ownerIdNum, offer.offerId);
        }
        if (Number.isFinite(providerIdNum) && providerIdNum > 0) {
          await store.unlockOffer(providerIdNum, offer.offerId);
        }
      }

      return offer;
    },

    async listFeed({ serviceType, adType, originCityId, destinationCityId, includeAcceptedOwnerId }) {
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

      const includeOwnerId = includeAcceptedOwnerId == null ? '' : String(includeAcceptedOwnerId).trim();

      if (includeOwnerId) {
        params.push(includeOwnerId);
        where.push(`(
          NOT EXISTS (
            SELECT 1 FROM offers o WHERE o.listing_id = listings.id AND o.status = 'accepted'
          )
          OR listings.owner_id = $${params.length}
        )`);
      } else {
        where.push(`NOT EXISTS (
          SELECT 1 FROM offers o WHERE o.listing_id = listings.id AND o.status = 'accepted'
        )`);
      }

      const sql = `SELECT * FROM listings ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC`;
      const { rows } = await pool.query(sql, params);
      return rows.map(mapListingRow);
    },

    async getOffersForListing(listingId, { viewerUserId } = {}) {
      const listing = await store.getListingById(listingId);
      if (!listing) {
        const err = new Error('listing not found');
        err.status = 404;
        throw err;
      }

      if (viewerUserId === undefined || viewerUserId === null || String(viewerUserId).trim() === '') {
        const err = new Error('viewer userId required');
        err.status = 400;
        throw err;
      }

      if (String(listing.ownerId) !== String(viewerUserId)) {
        const err = new Error('forbidden');
        err.status = 403;
        throw err;
      }

      const { rows } = await pool.query('SELECT * FROM offers WHERE listing_id=$1 ORDER BY offer_id ASC', [Number(listingId)]);

      let unlocked = new Set();
      const viewerNum = Number(viewerUserId);
      if (Number.isFinite(viewerNum) && viewerNum > 0) {
        const unlockedRows = await pool.query('SELECT offer_id FROM unlocked_offers WHERE user_id=$1', [viewerNum]);
        unlocked = new Set(unlockedRows.rows.map((r) => Number(r.offer_id)));
      }

      return rows.map((r) => {
        const offer = mapOfferRow(r);
        const isUnlocked = unlocked.has(Number(offer.offerId));
        return {
          ...offer,
          isUnlocked,
          phone: isUnlocked ? offer.phone : null,
          email: isUnlocked ? offer.email : null,
        };
      });
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

    async getOffersForProvider(providerId, { status } = {}) {
      const pid = String(providerId);
      if (!pid.trim()) {
        const err = new Error('providerId required');
        err.status = 400;
        throw err;
      }

      const where = ['o.provider_id = $1'];
      const params = [pid];
      if (status) {
        params.push(String(status));
        where.push(`o.status = $${params.length}`);
      }

      const sql = `
        SELECT
          o.*,
          l.*
        FROM offers o
        JOIN listings l ON l.id = o.listing_id
        WHERE ${where.join(' AND ')}
        ORDER BY o.created_at DESC NULLS LAST, o.offer_id DESC
      `;

      const { rows } = await pool.query(sql, params);

      const providerNum = Number(providerId);
      const unlocked = new Set(
        Number.isFinite(providerNum) && providerNum > 0
          ? await store.getUnlockedOfferIds(providerNum)
          : [],
      );

      const out = [];
      for (const row of rows) {
        const offer = mapOfferRow(row);
        const listing = mapListingRow(row);
        const isUnlocked = unlocked.has(Number(offer.offerId));

        // listing.ownerId is TEXT; try to parse to numeric userId for join.
        let owner = null;
        const ownerNum = Number(listing.ownerId);
        if (isUnlocked && Number.isFinite(ownerNum) && ownerNum > 0) {
          owner = await store.getUserById(ownerNum);
        }

        out.push({
          offer: {
            ...offer,
            isUnlocked,
            phone: isUnlocked ? offer.phone : null,
            email: isUnlocked ? offer.email : null,
          },
          listing,
          owner: owner
            ? {
                userId: owner.userId,
                email: owner.email,
                name: owner.name,
              }
            : null,
        });
      }

      return out;
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
