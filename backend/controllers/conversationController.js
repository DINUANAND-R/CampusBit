const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Listing = require('../models/Listing');
const User = require('../models/User');
const ItemRequest = require('../models/ItemRequest');
const Notification = require('../models/Notification');

// Helper to notify via socket if io is attached to app
const getIO = (req) => req.app.get('io');

/**
 * POST /api/listings/:listingId/conversations
 * Get or create private conversation between the authenticated buyer and the listing's seller
 */
exports.getOrCreateAuctionConversation = async (req, res, next) => {
  try {
    const { listingId } = req.params;
    const buyerId = req.user._id;

    const listing = await Listing.findById(listingId).populate('seller', 'username avatarUrl campusId email');
    if (!listing) {
      return res.status(404).json({ message: 'Auction listing not found.' });
    }

    if (listing.seller._id.toString() === buyerId.toString()) {
      return res.status(400).json({ message: 'You are the seller of this listing; you cannot start a buyer discussion with yourself.' });
    }

    let conversation = await Conversation.findOne({
      type: 'auction',
      listing: listing._id,
      buyer: buyerId,
    })
      .populate('participants', 'username avatarUrl campusId status role')
      .populate('seller', 'username avatarUrl campusId')
      .populate('buyer', 'username avatarUrl campusId')
      .populate('listing', 'title currentPrice startingPrice images status endsAt isModerated seller');

    if (!conversation) {
      conversation = await Conversation.create({
        type: 'auction',
        participants: [listing.seller._id, buyerId],
        listing: listing._id,
        seller: listing.seller._id,
        buyer: buyerId,
        lastMessageAt: new Date(),
        lastMessagePreview: 'Discussion started',
      });

      conversation = await Conversation.findById(conversation._id)
        .populate('participants', 'username avatarUrl campusId status role')
        .populate('seller', 'username avatarUrl campusId')
        .populate('buyer', 'username avatarUrl campusId')
        .populate('listing', 'title currentPrice startingPrice images status endsAt isModerated seller');
    }

    res.status(200).json({ conversation });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/listings/:listingId/conversations
 * Retrieve conversations for a listing:
 * - If seller: all buyer inquiry conversations for this listing
 * - If buyer: their own conversation for this listing
 */
exports.getListingConversations = async (req, res, next) => {
  try {
    const { listingId } = req.params;
    const userId = req.user._id;

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ message: 'Auction listing not found.' });
    }

    const isSeller = listing.seller.toString() === userId.toString();
    const filter = {
      type: 'auction',
      listing: listing._id,
    };

    if (isSeller) {
      filter.seller = userId;
    } else {
      filter.buyer = userId;
    }

    const conversations = await Conversation.find(filter)
      .populate('participants', 'username avatarUrl campusId status')
      .populate('seller', 'username avatarUrl campusId')
      .populate('buyer', 'username avatarUrl campusId')
      .populate('listing', 'title currentPrice startingPrice images status endsAt')
      .populate('lastMessage')
      .sort({ lastMessageAt: -1 })
      .lean();

    // Attach unread counts for current user
    const convIds = conversations.map((c) => c._id);
    const unreadAgg = await Message.aggregate([
      {
        $match: {
          conversation: { $in: convIds },
          sender: { $ne: userId },
          readBy: { $ne: userId },
        },
      },
      {
        $group: {
          _id: '$conversation',
          count: { $sum: 1 },
        },
      },
    ]);

    const unreadMap = new Map(unreadAgg.map((u) => [u._id.toString(), u.count]));
    const enriched = conversations.map((c) => ({
      ...c,
      unreadCount: unreadMap.get(c._id.toString()) || 0,
    }));

    res.json({ conversations: enriched, isSeller });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/conversations
 * List all conversations where authenticated user is a participant
 */
exports.getUserConversations = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { type, search } = req.query;

    const filter = {
      participants: userId,
    };

    if (type && ['auction', 'direct', 'request'].includes(type)) {
      filter.type = type;
    }

    let conversations = await Conversation.find(filter)
      .populate('participants', 'username avatarUrl campusId status role')
      .populate('seller', 'username avatarUrl campusId')
      .populate('buyer', 'username avatarUrl campusId')
      .populate('listing', 'title currentPrice startingPrice images status endsAt isModerated')
      .populate('itemRequest', 'title category status budgetMin budgetMax')
      .populate('lastMessage')
      .sort({ lastMessageAt: -1 })
      .lean();

    // Client-side text search across participants/titles if requested
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      conversations = conversations.filter((c) => {
        const otherParticipant = c.participants?.find((p) => p._id.toString() !== userId.toString());
        const matchUser = otherParticipant?.username?.toLowerCase().includes(q) || otherParticipant?.campusId?.toLowerCase().includes(q);
        const matchListing = c.listing?.title?.toLowerCase().includes(q);
        const matchRequest = c.itemRequest?.title?.toLowerCase().includes(q);
        const matchPreview = c.lastMessagePreview?.toLowerCase().includes(q);
        return matchUser || matchListing || matchRequest || matchPreview;
      });
    }

    // Attach unread counts
    const convIds = conversations.map((c) => c._id);
    const unreadAgg = await Message.aggregate([
      {
        $match: {
          conversation: { $in: convIds },
          sender: { $ne: userId },
          readBy: { $ne: userId },
        },
      },
      {
        $group: {
          _id: '$conversation',
          count: { $sum: 1 },
        },
      },
    ]);

    const unreadMap = new Map(unreadAgg.map((u) => [u._id.toString(), u.count]));
    const enriched = conversations.map((c) => ({
      ...c,
      unreadCount: unreadMap.get(c._id.toString()) || 0,
    }));

    res.json({ conversations: enriched });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/conversations/direct
 * Start or get existing direct conversation with another student
 */
exports.getOrCreateDirectConversation = async (req, res, next) => {
  try {
    const { recipientId } = req.body;
    const userId = req.user._id;

    if (!recipientId) {
      return res.status(400).json({ message: 'Recipient ID is required.' });
    }

    if (!mongoose.Types.ObjectId.isValid(recipientId)) {
      return res.status(400).json({ message: 'Invalid recipient ID format.' });
    }

    if (recipientId.toString() === userId.toString()) {
      return res.status(400).json({ message: 'You cannot start a direct conversation with yourself.' });
    }

    const recipient = await User.findById(recipientId).select('username avatarUrl campusId status role');
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient student not found.' });
    }

    if (recipient.status === 'banned') {
      return res.status(400).json({ message: 'Cannot message an account that has been banned.' });
    }

    let conversation = await Conversation.findOne({
      type: 'direct',
      participants: { $all: [userId, recipientId], $size: 2 },
    })
      .populate('participants', 'username avatarUrl campusId status role')
      .populate('lastMessage');

    if (!conversation) {
      conversation = await Conversation.create({
        type: 'direct',
        participants: [userId, recipientId],
        lastMessageAt: new Date(),
        lastMessagePreview: 'Conversation opened',
      });

      conversation = await Conversation.findById(conversation._id)
        .populate('participants', 'username avatarUrl campusId status role');
    }

    res.status(200).json({ conversation });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/conversations/request
 * Start or get conversation about a Looking-For-Item request
 */
exports.getOrCreateRequestConversation = async (req, res, next) => {
  try {
    const { requestId } = req.body;
    const userId = req.user._id;

    if (!requestId || !mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ message: 'Valid Item Request ID is required.' });
    }

    const itemRequest = await ItemRequest.findById(requestId).populate('requester', 'username avatarUrl campusId');
    if (!itemRequest) {
      return res.status(404).json({ message: 'Item request not found.' });
    }

    if (itemRequest.requester._id.toString() === userId.toString()) {
      return res.status(400).json({ message: 'You cannot message yourself about your own item request.' });
    }

    let conversation = await Conversation.findOne({
      type: 'request',
      itemRequest: itemRequest._id,
      participants: { $all: [userId, itemRequest.requester._id], $size: 2 },
    })
      .populate('participants', 'username avatarUrl campusId status role')
      .populate('itemRequest', 'title category status budgetMin budgetMax requester')
      .populate('lastMessage');

    if (!conversation) {
      conversation = await Conversation.create({
        type: 'request',
        itemRequest: itemRequest._id,
        participants: [itemRequest.requester._id, userId],
        lastMessageAt: new Date(),
        lastMessagePreview: `Inquiry about: ${itemRequest.title}`,
      });

      conversation = await Conversation.findById(conversation._id)
        .populate('participants', 'username avatarUrl campusId status role')
        .populate('itemRequest', 'title category status budgetMin budgetMax requester');
    }

    res.status(200).json({ conversation });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/conversations/:id
 * Get single conversation with full details
 */
exports.getConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid conversation ID format.' });
    }

    const conversation = await Conversation.findById(id)
      .populate('participants', 'username avatarUrl campusId status role')
      .populate('seller', 'username avatarUrl campusId')
      .populate('buyer', 'username avatarUrl campusId')
      .populate('listing', 'title currentPrice startingPrice images status endsAt isModerated seller')
      .populate('itemRequest', 'title category status budgetMin budgetMax requester')
      .populate('lastMessage');

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }

    if (!conversation.hasParticipant(userId)) {
      return res.status(403).json({ message: 'Access denied: You are not a participant in this conversation.' });
    }

    res.json({ conversation });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/conversations/:id/messages
 * Retrieve paginated message history for a conversation
 */
exports.getMessages = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { page = 1, limit = 50, before } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid conversation ID format.' });
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }

    if (!conversation.hasParticipant(userId)) {
      return res.status(403).json({ message: 'Access denied: You are not a participant in this conversation.' });
    }

    const filter = { conversation: id };
    if (before) {
      filter.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(filter)
      .populate('sender', 'username avatarUrl campusId role')
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const total = await Message.countDocuments({ conversation: id });

    res.json({
      messages,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/conversations/:id/messages
 * Send a message within a conversation (supports text and Multer attachments)
 */
exports.sendMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { content, clientTempId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid conversation ID format.' });
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }

    if (!conversation.hasParticipant(userId)) {
      return res.status(403).json({ message: 'Access denied: You are not a participant in this conversation.' });
    }

    if (conversation.isBlocked) {
      return res.status(403).json({ message: 'This conversation has been blocked.' });
    }

    // Format any uploaded attachments
    const attachments = (req.files || []).map((file) => ({
      url: `/uploads/attachments/${file.filename}`,
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    }));

    if ((!content || !content.trim()) && attachments.length === 0) {
      return res.status(400).json({ message: 'Message content or attachment is required.' });
    }

    // Deduplication check: if clientTempId supplied, verify not recently saved
    if (clientTempId) {
      const recentDup = await Message.findOne({
        conversation: id,
        sender: userId,
        clientTempId,
        createdAt: { $gte: new Date(Date.now() - 60000) },
      }).populate('sender', 'username avatarUrl campusId role');

      if (recentDup) {
        return res.status(200).json({ message: recentDup, deduplicated: true });
      }
    }

    const cleanContent = content ? content.trim() : '';

    const message = await Message.create({
      conversation: id,
      sender: userId,
      content: cleanContent,
      attachments,
      readBy: [userId],
      clientTempId: clientTempId || null,
    });

    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'username avatarUrl campusId role');

    // Update conversation metadata
    conversation.lastMessage = message._id;
    conversation.lastMessageAt = message.createdAt;
    conversation.lastMessagePreview = cleanContent.slice(0, 100) || (attachments.length > 0 ? '📎 Shared an attachment' : '');
    await conversation.save();

    // Determine recipients for notifications & socket broadcasts
    const recipients = conversation.participants.filter(
      (p) => p.toString() !== userId.toString()
    );

    // Create in-app notifications for other participants
    for (const recipientId of recipients) {
      let notifType = 'message';
      let notifTitle = `New message from @${req.user.username}`;
      let notifLink = `/chat?conv=${conversation._id}`;

      if (conversation.type === 'auction') {
        if (conversation.seller.toString() === userId.toString()) {
          notifType = 'auction_reply';
          notifTitle = `Seller replied to your question`;
          notifLink = `/listings/${conversation.listing}?tab=discussion`;
        } else {
          notifType = 'auction_question';
          notifTitle = `New question on your auction`;
          notifLink = `/listings/${conversation.listing}?tab=discussion`;
        }
      } else if (conversation.type === 'request') {
        notifType = 'item_request_reply';
        notifTitle = `New inquiry regarding your item request`;
        notifLink = `/chat?conv=${conversation._id}`;
      }

      await Notification.create({
        recipient: recipientId,
        sender: userId,
        type: notifType,
        title: notifTitle,
        message: cleanContent.slice(0, 100) || 'Sent an attachment',
        link: notifLink,
        conversation: conversation._id,
        listing: conversation.listing || null,
      });
    }

    // Real-time Socket.IO emission
    const io = getIO(req);
    if (io) {
      // 1. Broadcast new message to conversation room
      io.to(`conversation:${id}`).emit('message:new', {
        message: populatedMessage,
        conversationId: id,
      });

      // 2. Broadcast conversation update & notification to each recipient's user room
      recipients.forEach((recId) => {
        io.to(`user:${recId}`).emit('conversation:update', {
          conversationId: id,
          lastMessage: populatedMessage,
          lastMessageAt: message.createdAt,
          lastMessagePreview: conversation.lastMessagePreview,
        });

        io.to(`user:${recId}`).emit('notification:new', {
          sender: req.user.username,
          message: cleanContent.slice(0, 100) || 'Sent an attachment',
          conversationId: id,
          type: conversation.type,
        });
      });
    }

    res.status(201).json({
      message: populatedMessage,
      conversationId: id,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/conversations/:id/read
 * Mark messages in a conversation as read by the authenticated user
 */
exports.markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid conversation ID format.' });
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }

    if (!conversation.hasParticipant(userId)) {
      return res.status(403).json({ message: 'Access denied: You are not a participant in this conversation.' });
    }

    // Mark unread messages
    const updateResult = await Message.updateMany(
      {
        conversation: id,
        sender: { $ne: userId },
        readBy: { $ne: userId },
      },
      {
        $addToSet: { readBy: userId },
      }
    );

    // Mark notifications for this conversation as read
    await Notification.updateMany(
      {
        recipient: userId,
        conversation: id,
        isRead: false,
      },
      {
        $set: { isRead: true, readAt: new Date() },
      }
    );

    // Emit read receipt event via Socket.IO
    const io = getIO(req);
    if (io) {
      io.to(`conversation:${id}`).emit('message:read_receipt', {
        conversationId: id,
        readerId: userId,
        readAt: new Date(),
      });
    }

    res.json({
      success: true,
      markedReadCount: updateResult.modifiedCount || 0,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/conversations/unread/count
 * Retrieve total unread messages count across all user's conversations
 */
exports.getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const userConversations = await Conversation.find({ participants: userId }).select('_id');
    const convIds = userConversations.map((c) => c._id);

    const unreadCount = await Message.countDocuments({
      conversation: { $in: convIds },
      sender: { $ne: userId },
      readBy: { $ne: userId },
    });

    res.json({ unreadCount });
  } catch (err) {
    next(err);
  }
};
