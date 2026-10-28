const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/listingController');
const { protect, optionalAuth } = require('../middleware/auth');

router.get('/my', protect, ctrl.myListings);
router.get('/', optionalAuth, ctrl.getListings);
router.get('/:id', optionalAuth, ctrl.getListing);
router.post('/', protect, ctrl.createListing);
router.patch('/:id', protect, ctrl.updateListing);
router.delete('/:id', protect, ctrl.deleteListing);

module.exports = router;
