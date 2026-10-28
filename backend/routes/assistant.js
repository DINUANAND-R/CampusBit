const express = require('express');
const router = express.Router();
const assistantController = require('../controllers/assistantController');
const { optionalAuth } = require('../middleware/auth');

// POST /api/assistant/chat (authenticated or guest with optional user token)
router.post('/chat', optionalAuth, assistantController.handleChat);

// POST /api/assistant/compare
router.post('/compare', optionalAuth, assistantController.compareListingsHttp);

module.exports = router;
