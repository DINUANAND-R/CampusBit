/**
 * Comprehensive Automated Test Suite for:
 * CampusBid Reliable Global New-Product Notifications
 */

const { io } = require('socket.io-client');
const mongoose = require('mongoose');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000/api';
const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:5000';

async function req(url, options = {}) {
  const headers = { ...options.headers };
  if (!headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} - ${details}`);
    failed++;
  }
}

async function registerOrLogin(username, email, password, campusId = 'CB1234') {
  let res = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password, campusId }),
  });
  if (res.status === 201 && res.data?.access) {
    return { token: res.data.access, user: res.data.user };
  }
  // If already exists, login
  res = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 200 && res.data?.access) {
    return { token: res.data.access, user: res.data.user };
  }
  throw new Error(`Auth failed for ${username}: ${JSON.stringify(res.data)}`);
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campusbid');
  console.log('\n======================================================');
  console.log('🚀 Running CampusBid Global Notifications Test Suite');
  console.log('======================================================\n');

  const ts = Date.now();
  const sellerUser = await registerOrLogin(`seller_${ts}`, `seller_${ts}@campus.edu`, 'SellerPass123!');
  const buyer1 = await registerOrLogin(`buyer1_${ts}`, `buyer1_${ts}@campus.edu`, 'BuyerPass123!');
  const buyer2 = await registerOrLogin(`buyer2_${ts}`, `buyer2_${ts}@campus.edu`, 'BuyerPass123!');

  console.log('--- Step 1: Real-time Socket.IO Connection Setup ---');
  // Connect buyer1 socket
  const buyer1Socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    auth: { token: buyer1.token },
  });

  await new Promise((resolve) => buyer1Socket.on('connect', resolve));
  buyer1Socket.emit('user:auth', buyer1.token);
  assert(buyer1Socket.connected, 'Buyer1 socket connected and authenticated');

  // Set up real-time listener for buyer1
  let receivedSocketNotification = null;
  buyer1Socket.on('notification:new', (notif) => {
    receivedSocketNotification = notif;
  });

  console.log('\n--- Step 2: Immediate Listing Publication Notification ---');
  // Seller creates an immediately published listing
  const immediateListingRes = await req('/listings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sellerUser.token}` },
    body: JSON.stringify({
      title: `Engineering Graphics Kit ${ts}`,
      description: 'Complete drawing kit for 1st year engineering with drafter.',
      category: 'other',
      condition: 'like-new',
      startingPrice: 750,
      minBidIncrement: 25,
      durationHours: 24,
      publishType: 'now',
      images: ['https://images.unsplash.com/photo-1581291518857-4e27b48ff24e'],
    }),
  });

  assert(immediateListingRes.status === 201, 'Listing published immediately', immediateListingRes.data?.message);
  const immediateListing = immediateListingRes.data.listing;
  assert(immediateListing?.status === 'active', 'Listing status is active');

  // Wait 600ms for background notification job batch processing
  await new Promise((r) => setTimeout(r, 600));

  // Verify Seller did NOT receive notification for their own listing
  const sellerNotifs = await req('/notifications', {
    headers: { Authorization: `Bearer ${sellerUser.token}` },
  });
  const sellerOwnNotif = (sellerNotifs.data?.notifications || []).find(
    (n) => n.listing === immediateListing._id || n.link?.includes(immediateListing._id)
  );
  assert(!sellerOwnNotif, 'Seller is excluded from receiving notification for their own listing');

  // Verify Buyer 1 received persisted notification
  const buyer1Notifs = await req('/notifications', {
    headers: { Authorization: `Bearer ${buyer1.token}` },
  });
  assert(buyer1Notifs.status === 200, 'Buyer 1 can fetch notifications');
  const buyer1ListingNotif = (buyer1Notifs.data?.notifications || []).find(
    (n) => n.listing === immediateListing._id || n.link?.includes(immediateListing._id)
  );
  assert(!!buyer1ListingNotif, 'Buyer 1 received new-product notification in MongoDB');
  assert(buyer1ListingNotif?.type === 'NEW_LISTING', 'Notification type is NEW_LISTING');
  assert(
    buyer1ListingNotif?.title?.includes(`Engineering Graphics Kit ${ts}`),
    'Notification title includes listing title'
  );
  assert(
    buyer1ListingNotif?.message?.includes(`seller_${ts}`) && buyer1ListingNotif?.message?.includes('750'),
    'Notification message contains seller name and starting price'
  );
  assert(buyer1ListingNotif?.startingPrice === 750, 'Notification includes startingPrice');
  assert(buyer1ListingNotif?.isRead === false, 'Notification is marked unread initially');
  assert(
    buyer1ListingNotif?.link === `/listings/${immediateListing._id}`,
    'Notification link points to listing detail page'
  );

  // Verify Buyer 2 also received persisted notification
  const buyer2Notifs = await req('/notifications', {
    headers: { Authorization: `Bearer ${buyer2.token}` },
  });
  const buyer2ListingNotif = (buyer2Notifs.data?.notifications || []).find(
    (n) => n.listing === immediateListing._id || n.link?.includes(immediateListing._id)
  );
  assert(!!buyer2ListingNotif, 'Buyer 2 also received new-product notification in MongoDB');

  // Verify Socket.IO real-time emission was received by online Buyer 1
  assert(!!receivedSocketNotification, 'Buyer 1 received real-time Socket.IO notification event');
  assert(
    receivedSocketNotification?.listingId === immediateListing._id,
    'Real-time socket event references the correct listing ID'
  );

  console.log('\n--- Step 3: Unread Count Endpoint ---');
  const unreadCountRes = await req('/notifications/unread-count', {
    headers: { Authorization: `Bearer ${buyer1.token}` },
  });
  assert(unreadCountRes.status === 200, 'GET /api/notifications/unread-count returned 200');
  assert(unreadCountRes.data?.unreadCount >= 1, `Unread count is at least 1 (got ${unreadCountRes.data?.unreadCount})`);

  console.log('\n--- Step 4: Scheduled Listing Publication Behavior ---');
  // Create a future scheduled listing (tomorrow)
  const futurePublishAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const scheduledListingRes = await req('/listings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sellerUser.token}` },
    body: JSON.stringify({
      title: `Scientific Calculator FX-991 ${ts}`,
      description: 'Advanced calculator for mathematics exams.',
      category: 'electronics',
      condition: 'good',
      startingPrice: 600,
      publishType: 'later',
      publishAt: futurePublishAt,
      durationHours: 48,
      images: ['https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd'],
    }),
  });

  assert(scheduledListingRes.status === 201, 'Future scheduled listing created');
  const scheduledListing = scheduledListingRes.data.listing;
  assert(scheduledListing?.status === 'scheduled', 'Listing status is scheduled');

  // Verify NO notifications were created while listing is scheduled
  await new Promise((r) => setTimeout(r, 400));
  const buyer1ScheduledCheck = await req('/notifications', {
    headers: { Authorization: `Bearer ${buyer1.token}` },
  });
  const prematureNotif = (buyer1ScheduledCheck.data?.notifications || []).find(
    (n) => n.listing === scheduledListing._id || n.link?.includes(scheduledListing._id)
  );
  assert(!prematureNotif, 'Scheduled listing did NOT trigger premature notification before publication');

  console.log('\n--- Step 5: Scheduled Publisher Execution & Idempotency ---');
  // Simulate time arrival for a scheduled listing
  const Listing = require('./models/Listing');
  const now = new Date();
  await Listing.updateOne(
    { _id: scheduledListing._id },
    { publishAt: new Date(now.getTime() - 1000) }
  );

  // Run the scheduled publisher worker directly
  const { publishDueListings } = require('./jobs/scheduledPublisher');
  await publishDueListings(null);

  // Wait for background notification processing
  await new Promise((r) => setTimeout(r, 600));

  // Check that buyer 1 now received the notification
  const buyer1PostPublish = await req('/notifications', {
    headers: { Authorization: `Bearer ${buyer1.token}` },
  });
  const publishedNotif = (buyer1PostPublish.data?.notifications || []).find(
    (n) => n.listing === scheduledListing._id || n.link?.includes(scheduledListing._id)
  );
  assert(!!publishedNotif, 'Scheduled listing triggered notification upon publication');

  // Verify Idempotency: Re-run publisher and ensure NO duplicate notification is created
  await publishDueListings(null);
  const { queueNewListingNotification } = require('./services/notificationService');
  await queueNewListingNotification(scheduledListing._id, null);
  await new Promise((r) => setTimeout(r, 400));

  const buyer1DupCheck = await req('/notifications', {
    headers: { Authorization: `Bearer ${buyer1.token}` },
  });
  const dupList = (buyer1DupCheck.data?.notifications || []).filter(
    (n) => n.listing === scheduledListing._id || n.link?.includes(scheduledListing._id)
  );
  assert(dupList.length === 1, `Exactly 1 notification exists for listing after multiple runs (got ${dupList.length})`);

  console.log('\n--- Step 6: Editing Listing Does NOT Trigger New Notification ---');
  await req(`/listings/${immediateListing._id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${sellerUser.token}` },
    body: JSON.stringify({
      description: 'Updated description for the graphics kit.',
    }),
  });

  await new Promise((r) => setTimeout(r, 400));
  const buyer1EditCheck = await req('/notifications', {
    headers: { Authorization: `Bearer ${buyer1.token}` },
  });
  const editDupList = (buyer1EditCheck.data?.notifications || []).filter(
    (n) => n.listing === immediateListing._id || n.link?.includes(immediateListing._id)
  );
  assert(editDupList.length === 1, 'Editing existing listing did not generate duplicate notification');

  console.log('\n--- Step 7: Mark Notification Read & Read-All ---');
  // Mark one notification as read
  const markReadRes = await req(`/notifications/${buyer1ListingNotif._id}/read`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${buyer1.token}` },
  });
  assert(markReadRes.status === 200, 'PATCH /api/notifications/:id/read succeeded');
  assert(markReadRes.data?.notification?.isRead === true, 'Notification isRead changed to true');

  // Buyer 2 cannot mark Buyer 1's notification as read
  const crossUserRead = await req(`/notifications/${buyer1ListingNotif._id}/read`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${buyer2.token}` },
  });
  assert(
    crossUserRead.status === 404 || crossUserRead.status === 403,
    'Cross-user notification modification is forbidden (got 404/403)'
  );

  // Mark all read for Buyer 1
  const markAllRes = await req('/notifications/read-all', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${buyer1.token}` },
  });
  assert(markAllRes.status === 200, 'PATCH /api/notifications/read-all succeeded');

  const buyer1FinalCount = await req('/notifications/unread-count', {
    headers: { Authorization: `Bearer ${buyer1.token}` },
  });
  assert(buyer1FinalCount.data?.unreadCount === 0, 'Unread count is 0 after mark-all-read');

  buyer1Socket.disconnect();
  await mongoose.disconnect();

  console.log('\n======================================================');
  console.log(`🎉 TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
