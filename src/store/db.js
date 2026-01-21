// Simple in-memory store for mocking the API.

function nowIso() {
  return new Date().toISOString();
}

let nextUserId = 1;
let nextListingId = 1;
let nextOfferId = 1;

const db = {
  users: [],
  listings: [],
  offersByListingId: new Map(),
  unlockedOfferIdsByUserId: new Map(),

  createUser({ email, name, role, isPremium, providerServiceType }) {
    const user = {
      userId: String(nextUserId++),
      email,
      name,
      role,
      isPremium: Boolean(isPremium),
      providerServiceType: providerServiceType || null,
      createdAt: nowIso(),
    };
    db.users.push(user);
    return user;
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

    return listing;
  },

  listFeed({ userRole, serviceType, adType, originCityId, destinationCityId }) {
    let items = db.listings.slice();

    // Basic filtering (server-side)
    if (serviceType) items = items.filter((l) => String(l.serviceType) === String(serviceType));
    if (adType) items = items.filter((l) => String(l.adType) === String(adType));
    if (originCityId) items = items.filter((l) => String(l.originCityId || '') === String(originCityId));
    if (destinationCityId) items = items.filter((l) => String(l.destinationCityId || '') === String(destinationCityId));

    // userRole can be used later for role-specific feed rules.
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
  },
};

// Seed one demo user + one listing so feed isn't empty.
const demo = db.createUser({
  email: 'demo@bitasi.app',
  name: 'Demo Kullanıcı',
  role: 'seeker',
  isPremium: false,
});

const demoListing = db.createListing({
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

module.exports = { db };
