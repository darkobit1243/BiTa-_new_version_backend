const express = require('express');
const { feed, create, offersForListing, createOffer, acceptOffer, unlockAcceptedOffer } = require('../controllers/listingController');

const router = express.Router();

router.get('/feed', feed);
router.post('/', create);
router.get('/:listingId/offers', offersForListing);
router.post('/:listingId/offers', createOffer);
router.post('/:listingId/offers/:offerId/accept', acceptOffer);
router.post('/:listingId/offers/:offerId/unlock', unlockAcceptedOffer);

module.exports = router;
