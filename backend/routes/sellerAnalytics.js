const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/sellerAnalyticsController');
const { protect } = require('../middleware/auth');

router.get('/overview', protect, ctrl.getOverview);
router.get('/trends', protect, ctrl.getTrends);
router.get('/listings', protect, ctrl.getListingsAnalytics);
router.get('/listings/:listingId', protect, ctrl.getSingleListingAnalytics);

module.exports = router;
