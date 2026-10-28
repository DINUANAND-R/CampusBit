const { io } = require('socket.io-client');
const mongoose = require('mongoose');

const API = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type');
  const data = contentType && contentType.includes('application/json')
    ? await res.json()
    : await res.text();

  return { status: res.status, ok: res.ok, data };
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('🚀 CAMPUSBID AUTOMATED INTEGRATION & AUDIT TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc, condition, details = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc} ${details}`);
      failed++;
    }
  }

  try {
    // 1. Health check
    const health = await api('/health');
    assert('Server is up and responds to /api/health', health.status === 200 && health.data.status === 'ok');

    // 2. Authentication: Register 3 users (Seller, Bidder 1, Bidder 2)
    const timestamp = Date.now();
    const sellerPayload = {
      username: `seller_${timestamp}`,
      email: `seller_${timestamp}@campus.edu`,
      password: 'password123',
      campusId: 'CAMPUS-01',
    };
    const bidder1Payload = {
      username: `bidder1_${timestamp}`,
      email: `bidder1_${timestamp}@campus.edu`,
      password: 'password123',
      campusId: 'CAMPUS-02',
    };
    const bidder2Payload = {
      username: `bidder2_${timestamp}`,
      email: `bidder2_${timestamp}@campus.edu`,
      password: 'password123',
      campusId: 'CAMPUS-03',
    };

    const sellerReg = await api('/auth/register', { method: 'POST', body: sellerPayload });
    assert('Register Seller account', sellerReg.status === 201 && sellerReg.data.access);
    const sellerToken = sellerReg.data.access;
    const sellerId = sellerReg.data.user._id;

    const bidder1Reg = await api('/auth/register', { method: 'POST', body: bidder1Payload });
    assert('Register Bidder 1 account', bidder1Reg.status === 201 && bidder1Reg.data.access);
    const bidder1Token = bidder1Reg.data.access;
    const bidder1Id = bidder1Reg.data.user._id;

    const bidder2Reg = await api('/auth/register', { method: 'POST', body: bidder2Payload });
    assert('Register Bidder 2 account', bidder2Reg.status === 201 && bidder2Reg.data.access);
    const bidder2Token = bidder2Reg.data.access;
    const bidder2Id = bidder2Reg.data.user._id;

    // Login test
    const loginRes = await api('/auth/login', {
      method: 'POST',
      body: { email: sellerPayload.email, password: sellerPayload.password },
    });
    assert('Login with registered credentials returns token', loginRes.status === 200 && loginRes.data.access);

    // 3. Create Listing
    const listingPayload = {
      title: `Engineering Physics Textbook ${timestamp}`,
      description: 'Barely used 3rd semester textbook with formula sheet',
      category: 'books',
      condition: 'like-new',
      startingPrice: 100,
      minBidIncrement: 20,
      durationHours: 24,
      images: ['https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600'],
    };
    const createRes = await api('/listings', {
      method: 'POST',
      body: listingPayload,
      token: sellerToken,
    });
    assert('Create Listing successfully', createRes.status === 201 && createRes.data.listing._id);
    const listing = createRes.data.listing;
    const listingId = listing._id;

    // 4. Listing search and detail
    const getRes = await api(`/listings/${listingId}`);
    assert('Get Listing details by ID', getRes.status === 200 && getRes.data.listing.title === listingPayload.title);

    const searchRes = await api('/listings?q=Physics');
    assert('Search listings by query text', searchRes.status === 200 && searchRes.data.listings.length > 0);

    // 5. Bid Rules & Validation
    // Test: Seller cannot bid on own listing
    const selfBidRes = await api('/bids', {
      method: 'POST',
      body: { listingId, amount: 150 },
      token: sellerToken,
    });
    assert('Seller cannot bid on own listing (rejected with 403)', selfBidRes.status === 403);

    // Test: Minimum bid increment requirement (currentPrice 100 + increment 20 -> min 120. Bid 110 should fail)
    const lowBidRes = await api('/bids', {
      method: 'POST',
      body: { listingId, amount: 110 },
      token: bidder1Token,
    });
    assert('Bid below minimum increment rejected (rejected with 400)', lowBidRes.status === 400);

    // Test: Valid bid from Bidder 1 (120)
    const validBidRes = await api('/bids', {
      method: 'POST',
      body: { listingId, amount: 120 },
      token: bidder1Token,
    });
    assert('Valid bid placed successfully', validBidRes.status === 201 && validBidRes.data.listing.currentPrice === 120);

    // Verify leading price calculated on server & bids persisted in DB
    const updatedListing = await api(`/listings/${listingId}`);
    assert(
      'Server-calculated leading price updated to ₹120',
      updatedListing.data.listing.currentPrice === 120 &&
      (updatedListing.data.listing.winner?._id?.toString() === bidder1Id || updatedListing.data.listing.winner?.toString() === bidder1Id)
    );

    const bidHistory = await api(`/bids/listing/${listingId}`);
    assert(
      'Bid persisted in MongoDB and appears in history',
      bidHistory.data.bids.length === 1 && bidHistory.data.bids[0].amount === 120
    );

    // 6. Test Simultaneous Competing Bids (Optimistic Concurrency)
    // Both Bidder 1 and Bidder 2 attempt to bid ₹140 at the exact same millisecond
    const p1 = api('/bids', { method: 'POST', body: { listingId, amount: 140 }, token: bidder1Token });
    const p2 = api('/bids', { method: 'POST', body: { listingId, amount: 140 }, token: bidder2Token });

    const [r1, r2] = await Promise.all([p1, p2]);
    const onePassed = (r1.status === 201 && r2.status !== 201) || (r2.status === 201 && r1.status !== 201);
    assert('Simultaneous competing bids for same amount: exactly one succeeds', onePassed);

    // 7. Late-bid 30-Second Extension Rule
    const fastListingPayload = {
      title: `Fast Ending Item ${timestamp}`,
      description: 'Auction ending soon to test sniping extension',
      category: 'electronics',
      condition: 'good',
      startingPrice: 50,
      minBidIncrement: 10,
      durationHours: 1,
    };
    const fastCreate = await api('/listings', {
      method: 'POST',
      body: fastListingPayload,
      token: sellerToken,
    });
    const fastId = fastCreate.data.listing._id;

    // Connect to MongoDB to set endsAt to 18 seconds from now (< 30s)
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campusbid');
    const ListingModel = require('./models/Listing');
    const HandoverModel = require('./models/Handover');
    const now = new Date();
    const shortEnd = new Date(now.getTime() + 18 * 1000);
    await ListingModel.findByIdAndUpdate(fastId, { endsAt: shortEnd });

    // Bidder 1 places a late bid
    const lateBidRes = await api('/bids', {
      method: 'POST',
      body: { listingId: fastId, amount: 60 },
      token: bidder1Token,
    });
    assert('Late bid accepted', lateBidRes.status === 201);
    assert('Late bid triggered 30-second extension', lateBidRes.data.extended === true);
    assert('Extension count incremented to 1', lateBidRes.data.listing.extensionCount === 1);
    const extendedEndsAt = new Date(lateBidRes.data.newEndsAt);
    const diffMs = extendedEndsAt - shortEnd;
    assert('endsAt extended by exactly 30 seconds', diffMs === 30000);

    // 8. Test Auction Auto-Close and Handover Workflow
    // Fast forward auction by setting endsAt to 2 seconds in the past
    await ListingModel.findByIdAndUpdate(fastId, { endsAt: new Date(Date.now() - 2000) });

    console.log('  ⏳ Waiting up to 12s for background auction closer cron job to fire...');
    let closedListing = null;
    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      const chk = await ListingModel.findById(fastId);
      if (chk.status === 'closed') {
        closedListing = chk;
        break;
      }
    }
    assert('Cron job auto-closes expired auction', closedListing !== null && closedListing.status === 'closed');

    // Check Handover record was created
    const handover = await HandoverModel.findOne({ listing: fastId });
    assert('Handover record created upon auction close', handover !== null && handover.finalPrice === 60);

    // Test Handover permissions:
    // Non-seller cannot approve (403)
    const nonSellerApprove = await api(`/handover/${fastId}/approve`, { method: 'POST', token: bidder1Token });
    assert('Non-seller cannot approve handover (403)', nonSellerApprove.status === 403);

    // Seller approves handover -> receives 6-digit OTP
    const approveRes = await api(`/handover/${fastId}/approve`, { method: 'POST', token: sellerToken });
    assert('Seller approves handover', approveRes.status === 200 && approveRes.data.handoverCode);
    const otpCode = approveRes.data.handoverCode;
    assert('Handover OTP is a 6-digit code', /^\d{6}$/.test(otpCode));

    // Non-winner cannot confirm handover (403)
    const nonWinnerConfirm = await api(`/handover/${fastId}/confirm`, {
      method: 'POST',
      body: { code: otpCode },
      token: bidder2Token,
    });
    assert('Non-winner cannot confirm handover (403)', nonWinnerConfirm.status === 403);

    // Wrong OTP fails (400)
    const wrongOtpRes = await api(`/handover/${fastId}/confirm`, {
      method: 'POST',
      body: { code: '000000' },
      token: bidder1Token,
    });
    assert('Invalid OTP rejected (400)', wrongOtpRes.status === 400);

    // Buyer confirms handover with correct OTP
    const confirmRes = await api(`/handover/${fastId}/confirm`, {
      method: 'POST',
      body: { code: otpCode },
      token: bidder1Token,
    });
    assert('Buyer confirms handover with correct OTP', confirmRes.status === 200);

    const finalListing = await ListingModel.findById(fastId);
    assert('Listing status transitions to completed', finalListing.status === 'completed');

    // 9. Unsold Auction Tests
    // Case A: No bids placed
    const unsoldItem = await ListingModel.create({
      seller: sellerId,
      title: `Unsold No Bids ${timestamp}`,
      description: 'Nobody bids on this',
      category: 'other',
      condition: 'fair',
      startingPrice: 200,
      endsAt: new Date(Date.now() - 2000), // expired
      status: 'active',
    });
    console.log('  ⏳ Waiting up to 12s for cron to process unsold listing (no bids)...');
    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      const chk = await ListingModel.findById(unsoldItem._id);
      if (chk.status === 'unsold') break;
    }
    const unsoldChk = await ListingModel.findById(unsoldItem._id);
    assert('Expired auction with no bids marked as unsold', unsoldChk.status === 'unsold');

    // Case B: Reserve price not met
    const reserveItem = await ListingModel.create({
      seller: sellerId,
      title: `Reserve Unmet ${timestamp}`,
      description: 'Reserve is 500, bid is 300',
      category: 'electronics',
      condition: 'new',
      startingPrice: 100,
      reservePrice: 500,
      currentPrice: 300,
      winner: bidder1Id,
      endsAt: new Date(Date.now() - 2000), // expired
      status: 'active',
    });
    console.log('  ⏳ Waiting up to 12s for cron to process reserve-unmet listing...');
    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      const chk = await ListingModel.findById(reserveItem._id);
      if (chk.status === 'unsold') break;
    }
    const reserveChk = await ListingModel.findById(reserveItem._id);
    assert('Auction with highest bid below reservePrice marked as unsold', reserveChk.status === 'unsold');

    // 10. Socket.IO Real-time Events Test across two clients
    console.log('  🔌 Testing Socket.IO real-time event broadcasting...');
    const socket1 = io(SOCKET_URL, { transports: ['websocket'] });
    const socket2 = io(SOCKET_URL, { transports: ['websocket'] });

    await new Promise((res) => {
      let c = 0;
      const done = () => { if (++c === 2) res(); };
      socket1.on('connect', done);
      socket2.on('connect', done);
    });

    socket1.emit('auction:join', listingId.toString());
    socket2.emit('auction:join', listingId.toString());
    await sleep(300);

    let socket2ReceivedBid = null;
    socket2.on('auction:bid_update', (data) => {
      socket2ReceivedBid = data;
    });

    // Place bid via HTTP from Bidder 2
    await api('/bids', {
      method: 'POST',
      body: { listingId: listingId.toString(), amount: 160 },
      token: bidder2Token,
    });

    await sleep(500);
    assert(
      'Socket 2 receives real-time auction:bid_update event',
      socket2ReceivedBid !== null && socket2ReceivedBid.amount === 160
    );

    socket1.disconnect();
    socket2.disconnect();
    await mongoose.disconnect();

  } catch (globalErr) {
    console.error('Fatal test error:', globalErr);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite();
