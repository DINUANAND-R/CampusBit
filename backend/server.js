require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const listingRoutes = require('./routes/listings');
const bidRoutes = require('./routes/bids');
const handoverRoutes = require('./routes/handover');
const sellerAnalyticsRoutes = require('./routes/sellerAnalytics');
const adminRoutes = require('./routes/admin');
const reportRoutes = require('./routes/reports');
const conversationRoutes = require('./routes/conversations');
const itemRequestRoutes = require('./routes/itemRequests');
const notificationRoutes = require('./routes/notifications');
const wantedAlertRoutes = require('./routes/wantedAlerts');
const exchangeRoutes = require('./routes/exchanges');
const assistantRoutes = require('./routes/assistant');
const { registerSocketHandlers } = require('./socket/auctionSocket');
const { startAuctionCloser } = require('./jobs/auctionCloser');
const { startScheduledPublisher } = require('./jobs/scheduledPublisher');
const { setIO: setNotificationIO, resumePendingJobs } = require('./services/notificationService');

// ── Connect to MongoDB ────────────────────────────────────────────────────────
connectDB();

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
].filter(Boolean);

// ── Socket.IO ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
setNotificationIO(io);
registerSocketHandlers(io);
startAuctionCloser(io);
startScheduledPublisher(io);
resumePendingJobs(io);
app.set('io', io);

// ── Express middleware ────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Dev-friendly fallback
      }
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static Files (Uploads) ────────────────────────────────────────────────────
const path = require('path');
app.use(
  '/uploads/listings',
  express.static(path.join(__dirname, 'uploads', 'listings'), {
    dotfiles: 'deny',
    index: false,
    maxAge: '1d',
  })
);
app.use(
  '/uploads/attachments',
  express.static(path.join(__dirname, 'uploads', 'attachments'), {
    dotfiles: 'deny',
    index: false,
    maxAge: '1d',
  })
);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/handover', handoverRoutes);
app.use('/api/seller/analytics', sellerAnalyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/item-requests', itemRequestRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/wanted-alerts', wantedAlertRoutes);
app.use('/api/exchanges', exchangeRoutes);
app.use('/api/assistant', assistantRoutes);

// ── Alternative Proxy Bids Route Convention ──────────────────────────────────
const auctionProxyRouter = express.Router({ mergeParams: true });
const bidCtrl = require('./controllers/bidController');
const { protect } = require('./middleware/auth');
auctionProxyRouter.post('/', protect, bidCtrl.setProxyBidHttp);
auctionProxyRouter.get('/me', protect, bidCtrl.getProxyBidHttp);
auctionProxyRouter.patch('/me', protect, bidCtrl.setProxyBidHttp);
app.use('/api/auctions/:auctionId/proxy-bids', auctionProxyRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found` });
});

// Error handler
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 CampusBid backend running on http://localhost:${PORT}`);
});
