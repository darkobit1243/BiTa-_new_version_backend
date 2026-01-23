const express = require('express');
const { feed, create, offersForListing, createOffer, acceptOffer } = require('../controllers/listingController');

const router = express.Router();

router.get('/feed', feed);
router.post('/', create);
router.get('/:listingId/offers', offersForListing);
router.post('/:listingId/offers', createOffer);
router.post('/:listingId/offers/:offerId/accept', acceptOffer);

module.exports = router;
