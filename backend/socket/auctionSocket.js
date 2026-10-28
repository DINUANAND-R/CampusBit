const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const { placeBidCore } = require('../controllers/bidController');

/**
 * Authenticate a socket by checking the token sent in socket.handshake.auth.token
 * Returns the User document or null.
 */
const authenticateSocket = async (token) => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return await User.findById(decoded.id).select('-passwordHash');
  } catch {
    return null;
  }
};

const registerSocketHandlers = (io) => {
  io.on('connection', async (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // If token passed during handshake, auto-join user's personal room
    const initialToken = socket.handshake.auth?.token;
    if (initialToken) {
      const user = await authenticateSocket(initialToken);
      if (user) {
        socket.userId = user._id.toString();
        socket.join(`user:${user._id}`);
        console.log(`Socket ${socket.id} authenticated as @${user.username} (joined user:${user._id})`);
      }
    }

    // Explicit user authentication
    socket.on('user:auth', async (token) => {
      const user = await authenticateSocket(token);
      if (user) {
        socket.userId = user._id.toString();
        socket.join(`user:${user._id}`);
        socket.emit('user:authenticated', { userId: user._id, username: user.username });
        console.log(`Socket ${socket.id} joined personal room user:${user._id}`);
      }
    });

    // ── Auction Room Events ───────────────────────────────────────────────────────
    socket.on('auction:join', (listingId) => {
      socket.join(`auction:${listingId}`);
    });

    socket.on('auction:leave', (listingId) => {
      socket.leave(`auction:${listingId}`);
    });

    socket.on('auction:bid', async ({ listingId, amount, token }) => {
      const user = await authenticateSocket(token);
      if (!user) {
        socket.emit('auction:error', { message: 'Authentication required to bid' });
        return;
      }

      try {
        const { bid, listing, extended, newEndsAt } = await placeBidCore(
          listingId,
          user._id,
          Number(amount)
        );

        io.to(`auction:${listingId}`).emit('auction:bid_update', {
          listingId,
          amount: bid.amount,
          bidderId: user._id,
          bidderName: user.username,
          endsAt: listing.endsAt,
          isLateBid: bid.isLateBid,
        });

        if (extended) {
          io.to(`auction:${listingId}`).emit('auction:extended', {
            listingId,
            newEndsAt,
            extensionCount: listing.extensionCount,
          });
        }
      } catch (err) {
        socket.emit('auction:error', { message: err.message });
      }
    });

    // ── Real-Time Messaging & Discussion Events ──────────────────────────────────
    socket.on('conversation:join', async ({ conversationId, token }) => {
      try {
        console.log(`[Socket] conversation:join request for ${conversationId}`);
        const user = await authenticateSocket(token);
        if (!user) {
          console.log(`[Socket] conversation:join auth failed for ${conversationId}`);
          socket.emit('conversation:error', { message: 'Authentication required to join conversation.' });
          return;
        }

        const conv = await Conversation.findById(conversationId);
        if (!conv) {
          socket.emit('conversation:error', { message: 'Conversation not found.' });
          return;
        }

        if (!conv.hasParticipant(user._id)) {
          socket.emit('conversation:error', { message: 'Access denied: not a participant.' });
          return;
        }

        socket.join(`conversation:${conversationId}`);
        socket.emit('conversation:joined', { conversationId });
      } catch (err) {
        socket.emit('conversation:error', { message: err.message });
      }
    });

    socket.on('conversation:leave', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('conversation:typing', async ({ conversationId, token, isTyping }) => {
      const user = await authenticateSocket(token);
      if (!user) return;
      socket.to(`conversation:${conversationId}`).emit('conversation:typing_update', {
        conversationId,
        userId: user._id,
        username: user.username,
        isTyping: !!isTyping,
      });
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });
};

module.exports = { registerSocketHandlers, authenticateSocket };
