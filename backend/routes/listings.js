const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/listingController');
const { protect, optionalAuth } = require('../middleware/auth');
const { uploadListingImages } = require('../middleware/uploadMiddleware');

const convCtrl = require('../controllers/conversationController');

router.get('/my', protect, ctrl.myListings);
router.get('/', optionalAuth, ctrl.getListings);
router.get('/:id', optionalAuth, ctrl.getListing);
router.post('/', protect, uploadListingImages, ctrl.createListing);
router.patch('/:id/cancel', protect, ctrl.cancelListing);
router.patch('/:id', protect, uploadListingImages, ctrl.updateListing);
router.put('/:id', protect, uploadListingImages, ctrl.updateListing);
router.delete('/:id', protect, ctrl.deleteListing);

// Auction Discussion endpoints
router.post('/:listingId/conversations', protect, convCtrl.getOrCreateAuctionConversation);
router.get('/:listingId/conversations', protect, convCtrl.getListingConversations);

module.exports = router;
