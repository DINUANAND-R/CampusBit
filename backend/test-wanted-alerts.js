/**
 * Comprehensive Automated Test Suite for:
 * CampusBid Smart Wanted Alerts & Automatic Product Matching
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
  console.log('🎯 Running CampusBid Smart Wanted Alerts Test Suite');
  console.log('======================================================\n');

  const ts = Date.now();
  const studentHunter = await registerOrLogin(`hunter_${ts}`, `hunter_${ts}@campus.edu`, 'HunterPass123!');
  const studentPeer = await registerOrLogin(`peer_${ts}`, `peer_${ts}@campus.edu`, 'PeerPass123!');
  const sellerStudent = await registerOrLogin(`seller_${ts}`, `seller_${ts}@campus.edu`, 'SellerPass123!');

  console.log('--- Step 1: Real-time Socket.IO Connection Setup ---');
  const hunterSocket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    auth: { token: studentHunter.token },
  });

  await new Promise((resolve) => hunterSocket.on('connect', resolve));
  hunterSocket.emit('user:auth', studentHunter.token);
  assert(hunterSocket.connected, 'Student hunter socket connected and authenticated');

  let receivedSocketAlert = null;
  hunterSocket.on('notification:new', (notif) => {
    if (notif.type === 'WANTED_ALERT_MATCH') {
      receivedSocketAlert = notif;
    }
  });

  console.log('\n--- Step 2: Creating Wanted Alerts & Validation ---');
  // Validation: Missing budget
  const invalidAlert1 = await req('/wanted-alerts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${studentHunter.token}` },
    body: JSON.stringify({ keywords: 'scientific calculator' }),
  });
  assert(invalidAlert1.status === 400, 'Creation without budget rejected with 400');

  // Validation: Empty keywords
  const invalidAlert2 = await req('/wanted-alerts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${studentHunter.token}` },
    body: JSON.stringify({ keywords: '  ', maxBudget: 400 }),
  });
  assert(invalidAlert2.status === 400, 'Creation with empty keywords rejected with 400');

  // Valid creation: Alert for Scientific Calculator
  const createAlertRes = await req('/wanted-alerts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${studentHunter.token}` },
    body: JSON.stringify({
      keywords: `scientific calculator ${ts}`,
      description: 'Need fx-991 model for engineering exam',
      category: 'electronics',
      maxBudget: 500,
      condition: 'good',
      durationDays: 30,
    }),
  });
  assert(createAlertRes.status === 201, 'Student created wanted alert successfully');
  const alert = createAlertRes.data.alert;
  assert(alert?.status === 'ACTIVE', 'Alert status is ACTIVE');
  assert(alert?.maxBudget === 500, 'Alert maxBudget is ₹500');

  // Create second alert with higher budget for testing budget exclusion
  const alertBudgetStrictRes = await req('/wanted-alerts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${studentHunter.token}` },
    body: JSON.stringify({
      keywords: `lab coat apron ${ts}`,
      category: 'clothing',
      maxBudget: 250,
      condition: 'any',
      durationDays: 30,
    }),
  });
  const alertBudgetStrict = alertBudgetStrictRes.data.alert;

  console.log('\n--- Step 3: Privacy & Ownership Enforcement ---');
  // Peer student cannot view Hunter's alert details
  const crossView = await req(`/wanted-alerts/${alert._id}`, {
    headers: { Authorization: `Bearer ${studentPeer.token}` },
  });
  assert(crossView.status === 403, 'Cross-student alert view rejected with 403 Forbidden');

  // Peer student cannot edit Hunter's alert
  const crossEdit = await req(`/wanted-alerts/${alert._id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${studentPeer.token}` },
    body: JSON.stringify({ maxBudget: 100 }),
  });
  assert(crossEdit.status === 403, 'Cross-student alert update rejected with 403 Forbidden');

  // Peer student cannot delete Hunter's alert
  const crossDelete = await req(`/wanted-alerts/${alert._id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${studentPeer.token}` },
  });
  assert(crossDelete.status === 403, 'Cross-student alert deletion rejected with 403 Forbidden');

  console.log('\n--- Step 4: Status Controls (Pause, Resume, Extend) ---');
  // Pause alert
  const pauseRes = await req(`/wanted-alerts/${alert._id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${studentHunter.token}` },
    body: JSON.stringify({ status: 'PAUSED' }),
  });
  assert(pauseRes.status === 200, 'Wanted alert paused successfully');
  assert(pauseRes.data.alert.status === 'PAUSED', 'Status is now PAUSED');

  // Resume alert
  const resumeRes = await req(`/wanted-alerts/${alert._id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${studentHunter.token}` },
    body: JSON.stringify({ status: 'ACTIVE' }),
  });
  assert(resumeRes.status === 200, 'Wanted alert resumed successfully');
  assert(resumeRes.data.alert.status === 'ACTIVE', 'Status is now ACTIVE');

  console.log('\n--- Step 5: Matching Product Publication ---');
  // Seller publishes matching product: "scientific calculator" with startingPrice 450 (<= budget 500)
  const matchListingRes = await req('/listings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sellerStudent.token}` },
    body: JSON.stringify({
      title: `Casio Scientific Calculator ${ts}`,
      description: 'Complete fx-991 calculator with slip-on cover and fresh battery',
      category: 'electronics',
      condition: 'good',
      startingPrice: 450,
      minBidIncrement: 20,
      durationHours: 24,
      publishType: 'now',
      images: ['https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd'],
    }),
  });
  assert(matchListingRes.status === 201, 'Matching product published by seller');
  const matchListing = matchListingRes.data.listing;

  // Allow background matcher to process
  await new Promise((r) => setTimeout(r, 600));

  // Check persistent notification created for Hunter
  const hunterNotifs = await req('/notifications', {
    headers: { Authorization: `Bearer ${studentHunter.token}` },
  });
  const matchNotif = (hunterNotifs.data?.notifications || []).find(
    (n) =>
      n.type === 'WANTED_ALERT_MATCH' &&
      (n.listing?._id?.toString() === matchListing._id || n.listing === matchListing._id || n.link?.includes(matchListing._id))
  );
  assert(!!matchNotif, 'Hunter received persistent WANTED_ALERT_MATCH notification');
  assert(matchNotif?.title?.includes('Wanted Alert Match'), 'Notification title indicates wanted match');
  assert(matchNotif?.message?.includes('450') && matchNotif?.message?.includes('500'), 'Notification message mentions price and budget');
  assert(matchNotif?.link === `/listings/${matchListing._id}`, 'Notification link navigates to product');

  // Check real-time Socket.IO event received
  assert(!!receivedSocketAlert, 'Hunter received real-time Socket.IO alert for wanted match');

  // Verify Seller did NOT receive match alert for their own product
  const sellerNotifs = await req('/notifications', {
    headers: { Authorization: `Bearer ${sellerStudent.token}` },
  });
  const sellerOwnMatch = (sellerNotifs.data?.notifications || []).find(
    (n) => n.type === 'WANTED_ALERT_MATCH' && n.listing === matchListing._id
  );
  assert(!sellerOwnMatch, 'Seller is excluded from receiving match alert for their own product');

  console.log('\n--- Step 6: Budget Limit & Filter Strictness ---');
  // Seller publishes Lab Coat with startingPrice 400 (exceeds alertBudgetStrict maxBudget 250)
  const overBudgetRes = await req('/listings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sellerStudent.token}` },
    body: JSON.stringify({
      title: `Lab Coat Apron ${ts}`,
      description: 'Brand new white apron for chemistry laboratory',
      category: 'clothing',
      condition: 'new',
      startingPrice: 400, // > 250
      durationHours: 24,
      publishType: 'now',
      images: ['https://images.unsplash.com/photo-1581291518857-4e27b48ff24e'],
    }),
  });
  assert(overBudgetRes.status === 201, 'Over-budget listing published');
  const overBudgetListing = overBudgetRes.data.listing;

  await new Promise((r) => setTimeout(r, 600));

  const hunterOverBudgetCheck = await req('/notifications', {
    headers: { Authorization: `Bearer ${studentHunter.token}` },
  });
  const overBudgetNotif = (hunterOverBudgetCheck.data?.notifications || []).find(
    (n) => n.type === 'WANTED_ALERT_MATCH' && n.listing === overBudgetListing._id
  );
  assert(!overBudgetNotif, 'Listing exceeding maximum budget did NOT match');

  console.log('\n--- Step 7: Category & Keyword Isolation ---');
  // Seller publishes an unrelated item with generic words
  const unrelatedRes = await req('/listings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sellerStudent.token}` },
    body: JSON.stringify({
      title: `Organic Chemistry Textbook ${ts}`,
      description: 'Standard textbook for second year syllabus',
      category: 'books',
      condition: 'good',
      startingPrice: 300,
      durationHours: 24,
      publishType: 'now',
      images: ['https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c'],
    }),
  });
  const unrelatedListing = unrelatedRes.data.listing;
  await new Promise((r) => setTimeout(r, 600));

  const hunterUnrelatedCheck = await req('/notifications', {
    headers: { Authorization: `Bearer ${studentHunter.token}` },
  });
  const unrelatedNotif = (hunterUnrelatedCheck.data?.notifications || []).find(
    (n) => n.type === 'WANTED_ALERT_MATCH' && n.listing === unrelatedListing._id
  );
  assert(!unrelatedNotif, 'Unrelated product did NOT trigger false positive match');

  console.log('\n--- Step 8: Scheduled Listings Match Only When Published ---');
  // Create scheduled listing for later
  const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const scheduledMatchRes = await req('/listings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sellerStudent.token}` },
    body: JSON.stringify({
      title: `Scientific Calculator Graphic Model ${ts}`,
      description: 'Graphing calculator for mathematics',
      category: 'electronics',
      condition: 'good',
      startingPrice: 400,
      publishType: 'later',
      publishAt: futureDate,
      durationHours: 48,
      images: ['https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd'],
    }),
  });
  const scheduledListing = scheduledMatchRes.data.listing;
  assert(scheduledListing.status === 'scheduled', 'Listing is scheduled');

  await new Promise((r) => setTimeout(r, 400));
  const hunterPrePublish = await req('/notifications', {
    headers: { Authorization: `Bearer ${studentHunter.token}` },
  });
  const prematureMatch = (hunterPrePublish.data?.notifications || []).find(
    (n) => n.type === 'WANTED_ALERT_MATCH' && n.listing === scheduledListing._id
  );
  assert(!prematureMatch, 'Scheduled listing did NOT match before actual publication');

  // Simulate publication arrival via scheduled publisher
  const Listing = require('./models/Listing');
  const now = new Date();
  await Listing.updateOne(
    { _id: scheduledListing._id },
    { publishAt: new Date(now.getTime() - 1000) }
  );

  const { publishDueListings } = require('./jobs/scheduledPublisher');
  await publishDueListings(null);

  // Wait for background processing
  await new Promise((r) => setTimeout(r, 600));

  const hunterPostPublish = await req('/notifications', {
    headers: { Authorization: `Bearer ${studentHunter.token}` },
  });
  const postPublishMatch = (hunterPostPublish.data?.notifications || []).find(
    (n) =>
      n.type === 'WANTED_ALERT_MATCH' &&
      (n.listing?._id?.toString() === scheduledListing._id || n.listing === scheduledListing._id || n.link?.includes(scheduledListing._id))
  );
  assert(!!postPublishMatch, 'Scheduled listing triggered wanted alert match upon publication');

  console.log('\n--- Step 9: Idempotency & Duplicate Prevention ---');
  // Re-run matching directly
  const { matchListingAgainstWantedAlerts } = require('./services/wantedAlertService');
  await matchListingAgainstWantedAlerts(scheduledListing._id, null);
  await new Promise((r) => setTimeout(r, 400));

  const WantedAlertMatch = require('./models/WantedAlertMatch');
  const matchRecords = await WantedAlertMatch.find({ alert: alert._id, listing: scheduledListing._id });
  assert(matchRecords.length === 1, `Exactly 1 match record exists after re-run (got ${matchRecords.length})`);

  console.log('\n--- Step 10: Alert Matches Endpoint & Deletion ---');
  const matchesEndpointRes = await req(`/wanted-alerts/${alert._id}/matches`, {
    headers: { Authorization: `Bearer ${studentHunter.token}` },
  });
  assert(matchesEndpointRes.status === 200, 'GET /api/wanted-alerts/:id/matches returned 200');
  assert(matchesEndpointRes.data?.matches?.length >= 1, 'Matches endpoint returns matched listings');

  // Delete alert
  const deleteRes = await req(`/wanted-alerts/${alertBudgetStrict._id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${studentHunter.token}` },
  });
  assert(deleteRes.status === 200, 'Alert deleted successfully');

  hunterSocket.disconnect();
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
