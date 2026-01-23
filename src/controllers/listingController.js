const { store } = require('../store/store');

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

function getActorUserId(req) {
  const fromHeader = req.get('x-user-id');
  const fromQuery = req.query && req.query.userId;
  const fromBody = req.body && req.body.userId;
  const v = fromHeader || fromQuery || fromBody;
  return v === undefined || v === null ? null : String(v);
}

function sendStoreError(res, err) {
  const status = Number(err && err.status);
  if (Number.isFinite(status) && status >= 400 && status < 600) {
    return res.status(status).json({ data: { error: String(err.message || 'error') } });
  }
  console.error('[listingController] error:', err);
  return res.status(500).json({ data: { error: 'internal error' } });
}

async function feed(req, res) {
  const { userRole, serviceType, adType, originCityId, destinationCityId } = req.query || {};

  const list = await store.listFeed({
    userRole,
    serviceType,
    adType,
    originCityId,
    destinationCityId,
  });

  return res.json({ data: list });
}

async function create(req, res) {
  const body = req.body || {};

  // Minimal required fields according to current frontend request.
  const required = ['ownerId', 'ownerRole', 'title', 'adType', 'serviceType', 'originCityName', 'destinationCityName', 'date', 'cargoType', 'weight', 'isBoosted'];
  for (const key of required) {
    if (body[key] === undefined || body[key] === null || String(body[key]).trim() === '') {
      return res.status(400).json({ data: { error: `missing ${key}` } });
    }
  }

  const allowed = [
    'ownerId',
    'ownerRole',
    'title',
    'adType',
    'serviceType',
    'originCityId',
    'originCityName',
    'originDistrictId',
    'originDistrictName',
    'destinationCityId',
    'destinationCityName',
    'destinationDistrictId',
    'destinationDistrictName',
    'date',
    'cargoType',
    'weight',
    'providerId',
    'providerCompanyName',
    'notes',
    'isBoosted',
  ];

  const payload = pick(body, allowed);
  const listing = await store.createListing(payload);

  return res.status(201).json({ data: listing });
}

async function offersForListing(req, res) {
  try {
    const listingId = req.params.listingId;
    const userId = getActorUserId(req);
    const offers = await store.getOffersForListing(listingId, { viewerUserId: userId });
    return res.json({ data: offers });
  } catch (e) {
    return sendStoreError(res, e);
  }
}

async function createOffer(req, res) {
  try {
    const listingId = req.params.listingId;
    const userId = getActorUserId(req);
    if (!userId) {
      return res.status(400).json({ data: { error: 'userId required (header x-user-id or ?userId=...)' } });
    }

    const body = req.body || {};
    const providerId = String(body.providerId || userId);
    const companyName = String(body.companyName || '').trim();
    if (!companyName) {
      return res.status(400).json({ data: { error: 'companyName required' } });
    }

    const offer = await store.createOffer({
      listingId,
      providerId,
      companyName,
      phone: body.phone,
      email: body.email,
      providerCity: body.providerCity,
      providerDistrict: body.providerDistrict,
      price: body.price,
      rating: body.rating,
      reviewCount: body.reviewCount,
      yearsInBusiness: body.yearsInBusiness,
      vehicleCount: body.vehicleCount,
    });

    return res.status(201).json({ data: offer });
  } catch (e) {
    return sendStoreError(res, e);
  }
}

async function acceptOffer(req, res) {
  try {
    const listingId = req.params.listingId;
    const offerId = req.params.offerId;
    const userId = getActorUserId(req);
    if (!userId) {
      return res.status(400).json({ data: { error: 'userId required (header x-user-id or ?userId=...)' } });
    }

    const requirePayment = String(process.env.REQUIRE_PAYMENT_FOR_CONTACT || '').toLowerCase() === 'true';

    const accepted = await store.acceptOffer({
      listingId,
      offerId,
      ownerId: userId,
      unlockNow: !requirePayment,
    });

    return res.status(201).json({
      data: {
        ok: true,
        offer: accepted,
        contactUnlock: {
          mode: requirePayment ? 'payment_required' : 'bypass',
        },
      },
    });
  } catch (e) {
    return sendStoreError(res, e);
  }
}

module.exports = { feed, create, offersForListing, createOffer, acceptOffer };
