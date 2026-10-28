const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/bidController');
const { protect } = require('../middleware/auth');

router.post('/', protect, ctrl.placeBidHttp);
router.get('/my', protect, ctrl.myBids);
router.get('/listing/:id', ctrl.getBidHistory);

// Proxy bidding endpoints
router.post('/proxy', protect, ctrl.setProxyBidHttp);
router.get('/listing/:id/proxy', protect, ctrl.getProxyBidHttp);
router.patch('/listing/:id/proxy', protect, ctrl.setProxyBidHttp);

module.exports = router;
