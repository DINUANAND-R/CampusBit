const jwt = require('jsonwebtoken');
const User = require('../models/User');
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
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // Join auction room
    socket.on('auction:join', (listingId) => {
      socket.join(`auction:${listingId}`);
      console.log(`Socket ${socket.id} joined auction:${listingId}`);
    });

    // Leave auction room
    socket.on('auction:leave', (listingId) => {
      socket.leave(`auction:${listingId}`);
    });

    // Place a bid via Socket.IO
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

        // Broadcast new bid to everyone in the auction room
        io.to(`auction:${listingId}`).emit('auction:bid_update', {
          listingId,
          amount: bid.amount,
          bidderId: user._id,
          bidderName: user.username,
          endsAt: listing.endsAt,
          isLateBid: bid.isLateBid,
        });

        // If extension was applied, broadcast that too
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

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });
};

module.exports = { registerSocketHandlers };
