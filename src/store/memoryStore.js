// In-memory store (mock) with optional JSON persistence.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function truthy(v) {
  return ['1', 'true', 'yes', 'on'].includes(String(v || '').toLowerCase());
}

function nowIso() {
  return new Date().toISOString();
}

function cryptoRandomId() {
  return crypto.randomBytes(16).toString('hex');
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {
    // ignore
  }
}

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function computeNextId(items, getter, fallback) {
  let max = 0;
  for (const item of items) {
    const v = Number(getter(item));
    if (Number.isFinite(v) && v > max) max = v;
  }
  return Math.max(fallback, max + 1);
}

function serializeMaps({ offersByListingId, unlockedOfferIdsByUserId }) {
  const offersObj = {};
  for (const [k, v] of offersByListingId.entries()) {
    offersObj[String(k)] = Array.isArray(v) ? v : [];
  }

  const unlockedObj = {};
  for (const [k, set] of unlockedOfferIdsByUserId.entries()) {
    unlockedObj[String(k)] = Array.from(set || []);
  }

  return { offersByListingId: offersObj, unlockedOfferIdsByUserId: unlockedObj };
}

function hydrateMaps({ offersByListingId, unlockedOfferIdsByUserId }) {
  const offers = new Map();
  const unlocked = new Map();

  if (offersByListingId && typeof offersByListingId === 'object') {
    for (const [listingId, list] of Object.entries(offersByListingId)) {
      offers.set(String(listingId), Array.isArray(list) ? list : []);
    }
  }

  if (unlockedOfferIdsByUserId && typeof unlockedOfferIdsByUserId === 'object') {
    for (const [userId, ids] of Object.entries(unlockedOfferIdsByUserId)) {
      unlocked.set(String(userId), new Set(Array.isArray(ids) ? ids.map(Number) : []));
    }
  }

  return { offersByListingId: offers, unlockedOfferIdsByUserId: unlocked };
}

function createMemoryStore() {
  let nextUserId = 1;
  let nextListingId = 1;
  let nextOfferId = 1;

  const persistEnabled = truthy(process.env.PERSIST_DB);
  const dbPath = String(process.env.DB_PATH || path.join(process.cwd(), 'data', 'db.json'));

  let persistTimer = null;

  const db = {
    users: [],
    listings: [],
    offersByListingId: new Map(),
    unlockedOfferIdsByUserId: new Map(),
    passwordResetTokens: [],

    dump() {
      const { offersByListingId, unlockedOfferIdsByUserId } = serializeMaps(db);
      return {
        meta: {
          store: 'memory',
          persistEnabled,
          dbPath,
          counts: {
            users: db.users.length,
            listings: db.listings.length,
            offersLists: Object.keys(offersByListingId).length,
            unlockedUsers: Object.keys(unlockedOfferIdsByUserId).length,
          },
        },
        users: db.users,
        listings: db.listings,
        offersByListingId,
        unlockedOfferIdsByUserId,
        passwordResetTokens: db.passwordResetTokens,
        next: { nextUserId, nextListingId, nextOfferId },
      };
    },

    _persistSoon() {
      if (!persistEnabled) return;
      if (persistTimer) return;

      persistTimer = setTimeout(() => {
        persistTimer = null;
        try {
          ensureParentDir(dbPath);
          fs.writeFileSync(dbPath, JSON.stringify(db.dump(), null, 2), 'utf8');
        } catch (_) {
          // ignore
        }
      }, 250);
    },

    async init() {
      // no-op
    },

    async stats() {
      return { users: db.users.length, listings: db.listings.length };
    },

    createUser({ email, name, role, isPremium, providerServiceType, approvalStatus, passwordHash }) {
      const user = {
        userId: String(nextUserId++),
        email,
        name,
        role,
        isPremium: Boolean(isPremium),
        providerServiceType: providerServiceType || null,
        approvalStatus: approvalStatus ? String(approvalStatus) : 'pending',
        approvalReason: null,
        approvedAt: null,
        createdAt: nowIso(),

        // auth
        passwordHash: passwordHash || null,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
      };
      db.users.push(user);
      db._persistSoon();
      return user;
    },

    listUsers({ status } = {}) {
      let items = db.users.slice();
      if (status) {
        items = items.filter((u) => String(u.approvalStatus || 'pending') === String(status));
      }
      // newest first
      items.sort((a, b) => Number(b.userId) - Number(a.userId));
      return items;
    },

    setUserApproval({ userId, status, reason }) {
      const finalStatus = String(status);
      if (!['pending', 'approved', 'rejected'].includes(finalStatus)) {
        throw new Error('invalid status');
      }

      const u = db.users.find((x) => String(x.userId) === String(userId));
      if (!u) throw new Error('user not found');

      u.approvalStatus = finalStatus;
      u.approvalReason = reason ? String(reason) : null;
      u.approvedAt = finalStatus === 'approved' ? nowIso() : null;
      db._persistSoon();
      return u;
    },

    findUserByEmail(email) {
      return db.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
    },

    async findUserByEmail(email, { includeAuth } = {}) {
      const v = String(email || '').toLowerCase();
      const user = db.users.find((u) => String(u.email || '').toLowerCase() === v) || null;
      if (!user) return null;
      if (includeAuth) return user;
      // default: do not leak auth fields
      // eslint-disable-next-line no-unused-vars
      const { passwordHash, resetTokenHash, resetTokenExpiresAt, ...safe } = user;
      return safe;
    },

    async setUserPassword({ userId, passwordHash }) {
      const u = db.users.find((x) => String(x.userId) === String(userId));
      if (!u) return null;
      u.passwordHash = passwordHash || null;
      db._persistSoon();
      // eslint-disable-next-line no-unused-vars
      const { passwordHash: _ph, resetTokenHash, resetTokenExpiresAt, ...safe } = u;
      return safe;
    },

    async setUserResetToken({ userId, resetTokenHash, resetTokenExpiresAt }) {
      const u = db.users.find((x) => String(x.userId) === String(userId));
      if (!u) return null;
      u.resetTokenHash = resetTokenHash || null;
      u.resetTokenExpiresAt = resetTokenExpiresAt || null;
      db._persistSoon();
      // eslint-disable-next-line no-unused-vars
      const { passwordHash, resetTokenHash: _th, resetTokenExpiresAt: _te, ...safe } = u;
      return safe;
    },

    async clearUserResetToken({ userId }) {
      const u = db.users.find((x) => String(x.userId) === String(userId));
      if (!u) return null;
      u.resetTokenHash = null;
      u.resetTokenExpiresAt = null;
      db._persistSoon();
      // eslint-disable-next-line no-unused-vars
      const { passwordHash, resetTokenHash, resetTokenExpiresAt, ...safe } = u;
      return safe;
    },

    async createPasswordResetToken({ userId, otpHash, expiresAt }) {
      const token = {
        id: String(cryptoRandomId()),
        userId: String(userId),
        otpHash: String(otpHash),
        expiresAt: String(expiresAt),
        used: false,
        createdAt: nowIso(),
      };
      db.passwordResetTokens.push(token);
      db._persistSoon();
      return token;
    },

    async findValidPasswordResetToken({ userId, otpHash }) {
      const now = Date.now();
      const token = [...db.passwordResetTokens]
        .reverse()
        .find((t) =>
          String(t.userId) === String(userId) &&
          String(t.otpHash) === String(otpHash) &&
          !t.used &&
          Date.parse(String(t.expiresAt)) > now,
        );
      return token || null;
    },

    async markPasswordResetTokenUsed({ tokenId }) {
      const t = db.passwordResetTokens.find((x) => String(x.id) === String(tokenId));
      if (!t) return null;
      t.used = true;
      db._persistSoon();
      return t;
    },

    createListing(payload) {
      const listing = {
        id: String(nextListingId++),
        ...payload,
      };
      db.listings.unshift(listing);

      // Start with no offers; offers must be created by users.
      db.offersByListingId.set(listing.id, []);
      db._persistSoon();
      return listing;
    },

    listFeed({ userRole, serviceType, adType, originCityId, destinationCityId, includeAcceptedOwnerId }) {
      let items = db.listings.slice();
      if (serviceType) items = items.filter((l) => String(l.serviceType) === String(serviceType));
      if (adType) items = items.filter((l) => String(l.adType) === String(adType));
      if (originCityId) items = items.filter((l) => String(l.originCityId || '') === String(originCityId));
      if (destinationCityId) items = items.filter((l) => String(l.destinationCityId || '') === String(destinationCityId));
      const includeOwnerId = includeAcceptedOwnerId == null ? '' : String(includeAcceptedOwnerId).trim();

      function hasAcceptedOffer(listingId) {
        const list = db.offersByListingId.get(String(listingId)) || [];
        return list.some((o) => String(o.status || '').toLowerCase() === 'accepted');
      }

      items = items.filter((l) => {
        if (!hasAcceptedOffer(l.id)) return true;
        if (!includeOwnerId) return false;
        return String(l.ownerId) === includeOwnerId;
      });

      // userRole reserved for future
      return items;
    },

    getListingById(listingId) {
      return db.listings.find((l) => String(l.id) === String(listingId)) || null;
    },

    getOfferById(listingId, offerId) {
      const list = db.offersByListingId.get(String(listingId)) || [];
      return list.find((o) => String(o.offerId) === String(offerId)) || null;
    },

    createOffer({ listingId, providerId, companyName, phone, email, providerCity, providerDistrict, price }) {
      const listing = db.getListingById(listingId);
      if (!listing) {
        const err = new Error('listing not found');
        err.status = 404;
        throw err;
      }

      const offer = {
        offerId: nextOfferId++,
        id: null,
        listingId: String(listing.id),
        providerId: String(providerId),
        companyName: String(companyName || ''),
        phone: phone ? String(phone) : null,
        email: email ? String(email) : null,
        providerCity: providerCity ? String(providerCity) : null,
        providerDistrict: providerDistrict ? String(providerDistrict) : null,
        price: price === undefined || price === null ? null : Number(price),
        rating: null,
        reviewCount: null,
        yearsInBusiness: null,
        vehicleCount: null,
        status: 'pending',
        createdAt: nowIso(),
        acceptedAt: null,
        acceptedBy: null,
        isUnlocked: false,
      };
      offer.id = String(offer.offerId);

      const list = db.offersByListingId.get(String(listing.id)) || [];
      list.push(offer);
      db.offersByListingId.set(String(listing.id), list);
      db._persistSoon();
      return offer;
    },

    acceptOffer({ listingId, offerId, ownerId, unlockNow = true }) {
      const listing = db.getListingById(listingId);
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

      const list = db.offersByListingId.get(String(listing.id)) || [];
      const offer = list.find((o) => Number(o.offerId) === Number(offerId));
      if (!offer) {
        const err = new Error('offer not found');
        err.status = 404;
        throw err;
      }

      offer.status = 'accepted';
      offer.acceptedAt = nowIso();
      offer.acceptedBy = String(ownerId);

      if (unlockNow) {
        // Payment/unlock flow is bypassed for now.
        db.unlockOffer(ownerId, offer.offerId);
        if (offer.providerId) db.unlockOffer(offer.providerId, offer.offerId);
      }

      db._persistSoon();
      return offer;
    },

    getOffersForProvider(providerId, { status } = {}) {
      const pid = String(providerId);
      const statusFilter = status ? String(status).toLowerCase() : null;
      const unlocked = new Set(db.getUnlockedOfferIds(pid).map(Number));

      const out = [];
      for (const listing of db.listings) {
        const offers = db.offersByListingId.get(String(listing.id)) || [];
        for (const o of offers) {
          if (String(o.providerId) !== pid) continue;
          if (statusFilter && String(o.status || 'pending').toLowerCase() != statusFilter) continue;

          const isUnlocked = unlocked.has(Number(o.offerId));
          const owner = db.users.find((u) => String(u.userId) === String(listing.ownerId)) || null;

          out.push({
            offer: {
              ...o,
              isUnlocked,
              phone: isUnlocked ? o.phone : null,
              email: isUnlocked ? o.email : null,
            },
            listing,
            owner: isUnlocked && owner
              ? {
                  userId: String(owner.userId),
                  email: owner.email,
                  name: owner.name,
                }
              : null,
          });
        }
      }

      // Newest first when createdAt exists.
      out.sort((a, b) => String(b.offer.createdAt || '').localeCompare(String(a.offer.createdAt || '')));
      return out;
    },

    getOffersForListing(listingId, { viewerUserId } = {}) {
      const listing = db.getListingById(listingId);
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

      const unlocked = new Set(db.getUnlockedOfferIds(viewerUserId).map(Number));
      const list = db.offersByListingId.get(String(listingId)) || [];
      return list.map((o) => {
        const isUnlocked = unlocked.has(Number(o.offerId));
        return {
          ...o,
          isUnlocked,
          phone: isUnlocked ? o.phone : null,
          email: isUnlocked ? o.email : null,
        };
      });
    },

    getUnlockedOfferIds(userId) {
      const set = db.unlockedOfferIdsByUserId.get(String(userId)) || new Set();
      return Array.from(set);
    },

    unlockOffer(userId, offerId) {
      const uid = String(userId);
      const set = db.unlockedOfferIdsByUserId.get(uid) || new Set();
      set.add(Number(offerId));
      db.unlockedOfferIdsByUserId.set(uid, set);
      db._persistSoon();
    },
  };

  function seedDemoData() {}

  function tryLoadPersistedData() {
    if (!persistEnabled) return false;
    const snap = safeReadJson(dbPath);
    if (!snap || typeof snap !== 'object') return false;

    if (Array.isArray(snap.users)) db.users = snap.users;
    if (Array.isArray(snap.listings)) db.listings = snap.listings;

    const hydrated = hydrateMaps(snap);
    db.offersByListingId = hydrated.offersByListingId;
    db.unlockedOfferIdsByUserId = hydrated.unlockedOfferIdsByUserId;

    if (snap.next && typeof snap.next === 'object') {
      if (Number.isFinite(Number(snap.next.nextUserId))) nextUserId = Number(snap.next.nextUserId);
      if (Number.isFinite(Number(snap.next.nextListingId))) nextListingId = Number(snap.next.nextListingId);
      if (Number.isFinite(Number(snap.next.nextOfferId))) nextOfferId = Number(snap.next.nextOfferId);
    }

    nextUserId = computeNextId(db.users, (u) => u.userId, nextUserId);
    nextListingId = computeNextId(db.listings, (l) => l.id, nextListingId);

    const allOffers = [];
    for (const list of db.offersByListingId.values()) {
      if (Array.isArray(list)) allOffers.push(...list);
    }
    nextOfferId = computeNextId(allOffers, (o) => o.offerId || o.id, nextOfferId);

    return true;
  }

  if (!tryLoadPersistedData()) seedDemoData();

  return db;
}

module.exports = { createMemoryStore };
