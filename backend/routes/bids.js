const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/bidController');
const { protect } = require('../middleware/auth');

router.post('/', protect, ctrl.placeBidHttp);
router.get('/my', protect, ctrl.myBids);
router.get('/listing/:id', ctrl.getBidHistory);

module.exports = router;
