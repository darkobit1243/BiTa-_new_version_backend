const { db } = require('../store/db');

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

async function feed(req, res) {
  const { userRole, serviceType, adType, originCityId, destinationCityId } = req.query || {};

  const list = db.listFeed({
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
  const listing = db.createListing(payload);

  return res.status(201).json({ data: listing });
}

async function offersForListing(req, res) {
  const listingId = req.params.listingId;
  const offers = db.getOffersForListing(listingId);
  return res.json({ data: offers });
}

module.exports = { feed, create, offersForListing };
