const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/conversationController');
const { protect } = require('../middleware/auth');
const { handleAttachmentUpload } = require('../middleware/attachmentUpload');

// All conversation routes require authentication
router.use(protect);

// Global user conversations
router.get('/', ctrl.getUserConversations);
router.get('/unread/count', ctrl.getUnreadCount);

// Direct and Request conversation creation
router.post('/direct', ctrl.getOrCreateDirectConversation);
router.post('/request', ctrl.getOrCreateRequestConversation);

// Single conversation & messages
router.get('/:id', ctrl.getConversation);
router.get('/:id/messages', ctrl.getMessages);
router.post('/:id/messages', handleAttachmentUpload, ctrl.sendMessage);
router.patch('/:id/read', ctrl.markAsRead);

module.exports = router;
