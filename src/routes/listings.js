const express = require('express');
const { feed, create, offersForListing } = require('../controllers/listingController');

const router = express.Router();

router.get('/feed', feed);
router.post('/', create);
router.get('/:listingId/offers', offersForListing);

module.exports = router;
