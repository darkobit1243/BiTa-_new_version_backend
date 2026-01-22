// In-memory store (mock) with optional JSON persistence.

const fs = require('fs');
const path = require('path');

function truthy(v) {
  return ['1', 'true', 'yes', 'on'].includes(String(v || '').toLowerCase());
}

function nowIso() {
  return new Date().toISOString();
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

    createUser({ email, name, role, isPremium, providerServiceType, approvalStatus }) {
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

    createListing(payload) {
      const listing = {
        id: String(nextListingId++),
        ...payload,
      };
      db.listings.unshift(listing);

      // Seed 3 offers for this listing so offers screen has data.
      const baseOffers = [
        {
          offerId: nextOfferId++,
          providerId: 'provider_1',
          companyName: 'Express Logistics Ltd.',
          phone: '+90 532 123 4567',
          email: 'contact@expresslogistics.example',
          providerCity: payload.originCityName || 'İstanbul',
          providerDistrict: 'Kadıköy',
          price: 4500,
          rating: 4.8,
          reviewCount: 127,
          yearsInBusiness: 12,
          vehicleCount: 45,
        },
        {
          offerId: nextOfferId++,
          providerId: 'provider_2',
          companyName: 'Hızlı Taşıma A.Ş.',
          phone: '+90 533 987 6543',
          email: 'info@hizlitasima.example',
          providerCity: payload.originCityName || 'İstanbul',
          providerDistrict: 'Pendik',
          price: 4750,
          rating: 4.6,
          reviewCount: 86,
          yearsInBusiness: 7,
          vehicleCount: null,
        },
        {
          offerId: nextOfferId++,
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
      ].map((o) => ({
        ...o,
        id: String(o.offerId),
        listingId: listing.id,
        isUnlocked: false,
      }));

      db.offersByListingId.set(listing.id, baseOffers);
      db._persistSoon();
      return listing;
    },

    listFeed({ userRole, serviceType, adType, originCityId, destinationCityId }) {
      let items = db.listings.slice();
      if (serviceType) items = items.filter((l) => String(l.serviceType) === String(serviceType));
      if (adType) items = items.filter((l) => String(l.adType) === String(adType));
      if (originCityId) items = items.filter((l) => String(l.originCityId || '') === String(originCityId));
      if (destinationCityId) items = items.filter((l) => String(l.destinationCityId || '') === String(destinationCityId));
      // userRole reserved for future
      return items;
    },

    getOffersForListing(listingId) {
      return db.offersByListingId.get(String(listingId)) || [];
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

  function seedDemoData() {
    const demo = db.createUser({
      email: 'demo@bitasi.app',
      name: 'Demo Kullanıcı',
      role: 'seeker',
      isPremium: false,
    });

    db.createListing({
      ownerId: demo.email,
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
      date: nowIso(),
      cargoType: 'Palet',
      weight: '1000',
      providerId: null,
      providerCompanyName: null,
      notes: null,
      isBoosted: false,
    });
  }

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
