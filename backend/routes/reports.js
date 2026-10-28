const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reportController');
const { protect } = require('../middleware/auth');

router.post('/', protect, ctrl.createReport);
router.get('/my', protect, ctrl.getMyReports);

module.exports = router;
