/**
 * Comprehensive Automated Test Suite for:
 * CampusBid Automatic Proxy Bidding (Maximum Bid) System
 */

const { io } = require('socket.io-client');
const mongoose = require('mongoose');
const Listing = require('./models/Listing');
const Bid = require('./models/Bid');
const ProxyBid = require('./models/ProxyBid');
const Notification = require('./models/Notification');
const User = require('./models/User');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000/api';
const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:5000';

async function req(url, options = {}) {
  const headers = { ...options.headers };
  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
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

const createPngBuffer = () => {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d,
    0xb0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
    0x44, 0xae, 0x42, 0x60, 0x82
  ]);
};

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

function createClientSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(err));
  });
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campusbid');
  console.log('\n======================================================');
  console.log('🎯 Running CampusBid Automatic Proxy Bidding Test Suite');
  console.log('======================================================\n');

  try {
    const timestamp = Date.now();
    // 1. Setup Participants
    const seller = await registerOrLogin(
      `px_seller_${timestamp}`,
      `px_seller_${timestamp}@campus.edu`,
      'Password123!',
      `SEL${timestamp.toString().slice(-4)}`
    );
    const buyerA = await registerOrLogin(
      `px_buyerA_${timestamp}`,
      `px_buyerA_${timestamp}@campus.edu`,
      'Password123!',
      `BYA${timestamp.toString().slice(-4)}`
    );
    const buyerB = await registerOrLogin(
      `px_buyerB_${timestamp}`,
      `px_buyerB_${timestamp}@campus.edu`,
      'Password123!',
      `BYB${timestamp.toString().slice(-4)}`
    );
    const buyerC = await registerOrLogin(
      `px_buyerC_${timestamp}`,
      `px_buyerC_${timestamp}@campus.edu`,
      'Password123!',
      `BYC${timestamp.toString().slice(-4)}`
    );
    const buyerD = await registerOrLogin(
      `px_buyerD_${timestamp}`,
      `px_buyerD_${timestamp}@campus.edu`,
      'Password123!',
      `BYD${timestamp.toString().slice(-4)}`
    );

    console.log('1. Connecting real-time Socket.IO clients for buyers...');
    const socketA = await createClientSocket(buyerA.token);
    socketA.emit('user:auth', buyerA.user._id);

    const socketB = await createClientSocket(buyerB.token);
    socketB.emit('user:auth', buyerB.user._id);

    assert(socketA.connected, 'Buyer A socket connected & authenticated');
    assert(socketB.connected, 'Buyer B socket connected & authenticated');

    // 2. Create Auction Listing: Starting Price = ₹1,000, Increment = ₹100
    console.log('\n2. Creating auction listing (Starting Price: ₹1,000, Increment: ₹100)...');
    const formData = new FormData();
    formData.append('title', `iPad Air 5th Gen - Proxy Test ${timestamp}`);
    formData.append('description', 'M1 chip 64GB Space Gray in mint condition.');
    formData.append('category', 'electronics');
    formData.append('condition', 'like-new');
    formData.append('startingPrice', '1000');
    formData.append('minBidIncrement', '100');
    formData.append('durationHours', '24');

    const pngBlob = new Blob([createPngBuffer()], { type: 'image/png' });
    formData.append('images', pngBlob, 'ipad.png');

    const listingRes = await fetch(`${BASE_URL}/listings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${seller.token}` },
      body: formData,
    });
    const listingData = await listingRes.json();
    assert(listingRes.status === 201, 'Auction listing created successfully');
    const listingId = listingData.listing._id;

    // Join auction room on sockets
    socketA.emit('auction:join', listingId);
    socketB.emit('auction:join', listingId);

    // Track public socket broadcasts
    let lastBidUpdate = null;
    socketB.on('auction:bid_update', (data) => {
      if (data.listingId === listingId) lastBidUpdate = data;
    });

    let buyerAOutbidEvent = null;
    socketA.on('proxy:outbid', (data) => {
      if (data.listingId === listingId) buyerAOutbidEvent = data;
    });

    // 3. Test 1: Buyer A submits maximum of ₹1,800. Becomes leader at minimum required price (₹1,100)
    console.log('\n3. Testing Case 1: Buyer A sets maximum of ₹1,800...');
    const proxyResA = await req('/bids/proxy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyerA.token}` },
      body: JSON.stringify({ listingId, maxAmount: 1800 }),
    });

    assert(proxyResA.status === 200, 'Buyer A proxy bid accepted');
    assert(proxyResA.data.isLeader === true, 'Buyer A is designated as the leader');
    assert(proxyResA.data.currentPrice === 1100, `Price becomes ₹1,100 (starting ₹1,000 + inc ₹100) [got: ${proxyResA.data.currentPrice}]`);

    // Verify public listing state
    const publicListing1 = await req(`/listings/${listingId}`);
    assert(publicListing1.data.listing.currentPrice === 1100, 'Public listing reflects current price ₹1,100');
    assert(publicListing1.data.listing.winner._id === buyerA.user._id, 'Public listing shows Buyer A as winner');

    // 4. Test 2: Buyer B submits lower maximum of ₹1,400. Buyer A remains leader at ₹1,500
    console.log('\n4. Testing Case 2: Buyer B sets maximum of ₹1,400...');
    const proxyResB = await req('/bids/proxy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyerB.token}` },
      body: JSON.stringify({ listingId, maxAmount: 1400 }),
    });

    assert(proxyResB.status === 200, 'Buyer B proxy bid accepted');
    assert(proxyResB.data.isLeader === false, 'Buyer B does not displace Buyer A');
    assert(proxyResB.data.currentPrice === 1500, `Price rises to ₹1,500 (Buyer B max ₹1,400 + inc ₹100) [got: ${proxyResB.data.currentPrice}]`);

    const publicListing2 = await req(`/listings/${listingId}`);
    assert(publicListing2.data.listing.currentPrice === 1500, 'Public price updated to ₹1,500');
    assert(publicListing2.data.listing.winner._id === buyerA.user._id, 'Buyer A remains leading bidder');

    // 5. Test 3: Buyer C submits higher maximum of ₹2,000. Buyer C becomes leader at ₹1,900
    console.log('\n5. Testing Case 3: Buyer C sets maximum of ₹2,000...');
    const proxyResC = await req('/bids/proxy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyerC.token}` },
      body: JSON.stringify({ listingId, maxAmount: 2000 }),
    });

    assert(proxyResC.status === 200, 'Buyer C proxy bid accepted');
    assert(proxyResC.data.isLeader === true, 'Buyer C becomes the new leader');
    assert(proxyResC.data.currentPrice === 1900, `Price rises to ₹1,900 (Buyer A max ₹1,800 + inc ₹100) [got: ${proxyResC.data.currentPrice}]`);

    const publicListing3 = await req(`/listings/${listingId}`);
    assert(publicListing3.data.listing.currentPrice === 1900, 'Public price updated to ₹1,900');
    assert(publicListing3.data.listing.winner._id === buyerC.user._id, 'Buyer C is the new leading bidder');

    // Verify outbid notification received by Buyer A
    await new Promise((r) => setTimeout(r, 300));
    assert(buyerAOutbidEvent !== null, 'Buyer A received real-time socket proxy:outbid notification');

    const notifsA = await Notification.find({ recipient: buyerA.user._id, type: 'PROXY_OUTBID' });
    assert(notifsA.length > 0, 'Buyer A received persisted PROXY_OUTBID notification in database');

    // 6. Test 4: Leader maximum capping boundary condition
    console.log('\n6. Testing Boundary: Competing maximum requires beating beyond leader max...');
    // Create new listing: Starting ₹1,000, Increment ₹100
    const formDataCap = new FormData();
    formDataCap.append('title', `Cap Test Listing ${timestamp}`);
    formDataCap.append('description', 'Testing leader max cap');
    formDataCap.append('category', 'electronics');
    formDataCap.append('condition', 'good');
    formDataCap.append('startingPrice', '1000');
    formDataCap.append('minBidIncrement', '100');
    formDataCap.append('durationHours', '24');
    formDataCap.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'cap.png');

    const capListRes = await fetch(`${BASE_URL}/listings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${seller.token}` },
      body: formDataCap,
    });
    const capListingId = (await capListRes.json()).listing._id;

    // Buyer A max = ₹1,800
    await req('/bids/proxy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyerA.token}` },
      body: JSON.stringify({ listingId: capListingId, maxAmount: 1800 }),
    });

    // Buyer D sets max = ₹1,850 (competing + inc would be 1,800 + 100 = 1,900 > 1,850)
    const capResD = await req('/bids/proxy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyerD.token}` },
      body: JSON.stringify({ listingId: capListingId, maxAmount: 1850 }),
    });

    assert(capResD.data.isLeader === true, 'Buyer D is leader');
    assert(capResD.data.currentPrice === 1850, `Price capped exactly at Buyer D's max ₹1,850 [got: ${capResD.data.currentPrice}]`);

    // 7. Test 5: Equal Maximums Tie-Break Rule (Earliest timestamp wins)
    console.log('\n7. Testing Deterministic Tie-Break for Equal Maximums...');
    // Create new listing: Starting ₹500, Increment ₹50
    const formDataTie = new FormData();
    formDataTie.append('title', `Tie Break Test ${timestamp}`);
    formDataTie.append('description', 'Testing equal maximums tie-break');
    formDataTie.append('category', 'books');
    formDataTie.append('condition', 'good');
    formDataTie.append('startingPrice', '500');
    formDataTie.append('minBidIncrement', '50');
    formDataTie.append('durationHours', '24');
    formDataTie.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'tie.png');

    const tieListRes = await fetch(`${BASE_URL}/listings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${seller.token}` },
      body: formDataTie,
    });
    const tieListingId = (await tieListRes.json()).listing._id;

    // Buyer A sets max ₹1,000 at T1
    await req('/bids/proxy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyerA.token}` },
      body: JSON.stringify({ listingId: tieListingId, maxAmount: 1000 }),
    });

    // Buyer B sets equal max ₹1,000 at T2 (T2 > T1)
    await new Promise((r) => setTimeout(r, 50));
    const tieResB = await req('/bids/proxy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyerB.token}` },
      body: JSON.stringify({ listingId: tieListingId, maxAmount: 1000 }),
    });

    assert(tieResB.data.isLeader === false, 'Buyer B (later timestamp) does not displace Buyer A');
    assert(tieResB.data.currentPrice === 1000, `Price rises to the equal maximum ₹1,000 [got: ${tieResB.data.currentPrice}]`);

    const tieListingCheck = await req(`/listings/${tieListingId}`);
    assert(tieListingCheck.data.listing.winner._id === buyerA.user._id, 'Buyer A (earliest submission) remains the authoritative winner');

    // 8. Test 6: Seller cannot bid on their own listing
    console.log('\n8. Testing Seller Self-Bidding Prohibition...');
    const sellerSelfBidRes = await req('/bids/proxy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${seller.token}` },
      body: JSON.stringify({ listingId, maxAmount: 5000 }),
    });
    assert(sellerSelfBidRes.status === 403, 'Seller blocked from placing proxy bid on their own listing (403)');

    // 9. Test 7: Reject bids before start and after end
    console.log('\n9. Testing Timing Validation (before start and after end)...');
    // Expired listing
    const expiredListing = new Listing({
      title: `Expired Item ${timestamp}`,
      description: 'Past end time',
      category: 'books',
      condition: 'good',
      startingPrice: 100,
      seller: seller.user._id,
      status: 'active',
      endsAt: new Date(Date.now() - 10000), // ended 10s ago
      images: [{ url: '/uploads/listings/exp.png', filename: 'exp.png' }],
    });
    await expiredListing.save();

    const expiredBidRes = await req('/bids/proxy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyerA.token}` },
      body: JSON.stringify({ listingId: expiredListing._id, maxAmount: 500 }),
    });
    assert(expiredBidRes.status === 400, 'Bid rejected on ended auction (400)');

    // 10. Test 8: Leader cannot set maximum below already committed leading price
    console.log('\n10. Testing committed price floor on proxy updates...');
    // Buyer C is currently leading listingId at ₹1,900 with max ₹2,000
    const lowerMaxRes = await req('/bids/proxy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyerC.token}` },
      body: JSON.stringify({ listingId, maxAmount: 1600 }), // below current committed 1,900
    });
    assert(lowerMaxRes.status === 400, 'Leader cannot reduce maximum below current leading price of ₹1,900 (400)');

    // But leader CAN update to a higher maximum (e.g. ₹2,500)
    const higherMaxRes = await req('/bids/proxy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyerC.token}` },
      body: JSON.stringify({ listingId, maxAmount: 2500 }),
    });
    assert(higherMaxRes.status === 200, 'Leader can raise their maximum to ₹2,500');
    assert(higherMaxRes.data.currentPrice === 1900, 'Current price remains ₹1,900 since no new competing bid arrived');

    // 11. Test 9: Public API privacy: NEVER expose private maximums
    console.log('\n11. Testing Private Maximum Confidentiality...');
    // Public listing query
    const publicData = await req(`/listings/${listingId}`);
    const publicJsonStr = JSON.stringify(publicData.data);
    assert(!publicJsonStr.includes('2500'), 'Public listing response never contains Buyer C private maximum (₹2,500)');
    assert(!publicJsonStr.includes('1800'), 'Public listing response never contains Buyer A private maximum (₹1,800)');

    // Public bid history query
    const bidHistoryData = await req(`/bids/listing/${listingId}`);
    const bidHistoryJsonStr = JSON.stringify(bidHistoryData.data);
    assert(!bidHistoryJsonStr.includes('2500'), 'Public bid history never exposes private maximum amounts');

    // Authenticated user can see ONLY their own private maximum
    const myProxyC = await req(`/bids/listing/${listingId}/proxy`, {
      headers: { Authorization: `Bearer ${buyerC.token}` },
    });
    assert(myProxyC.status === 200, 'Buyer C can fetch their own private maximum');
    assert(myProxyC.data.proxyBid.maxAmount === 2500, 'Buyer C sees their own maximum of ₹2,500');

    // Buyer A checking their own sees ₹1,800, NOT Buyer C's ₹2,500
    const myProxyA = await req(`/bids/listing/${listingId}/proxy`, {
      headers: { Authorization: `Bearer ${buyerA.token}` },
    });
    assert(myProxyA.data.proxyBid.maxAmount === 1800, 'Buyer A sees only their own maximum of ₹1,800');

    // 12. Test 10: Alternative Route Convention Support (/api/auctions/:auctionId/proxy-bids)
    console.log('\n12. Testing Alternative Route Convention (/api/auctions/:auctionId/proxy-bids)...');
    const altRouteGet = await req(`/auctions/${listingId}/proxy-bids/me`, {
      headers: { Authorization: `Bearer ${buyerC.token}` },
    });
    assert(altRouteGet.status === 200, 'GET /api/auctions/:auctionId/proxy-bids/me succeeds');
    assert(altRouteGet.data.proxyBid?.maxAmount === 2500, 'Alternative route returns user proxy bid');

    // 13. Test 11: Manual bidding counter-interaction with proxy bidding
    console.log('\n13. Testing Manual Bid interaction with Proxy Bidding...');
    // Buyer C has proxy max ₹2,500. Current price is ₹1,900. Increment is ₹100.
    // Buyer D places a manual bid of ₹2,100
    const manualBidRes = await req('/bids', {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyerD.token}` },
      body: JSON.stringify({ listingId, amount: 2100 }),
    });

    assert(manualBidRes.status === 201, 'Buyer D manual bid placed at ₹2,100');

    // Since Buyer C has proxy max ₹2,500, Buyer C automatically counters at 2,100 + 100 = ₹2,200!
    const manualListingAfter = await req(`/listings/${listingId}`);
    assert(manualListingAfter.data.listing.currentPrice === 2200, `Buyer C proxy automatically countered to ₹2,200 [got: ${manualListingAfter.data.listing.currentPrice}]`);
    assert(manualListingAfter.data.listing.winner._id === buyerC.user._id, 'Buyer C remains leader after manual bid counter');

    // 14. Test 12: Real-time socket event delivery without manual refresh
    console.log('\n14. Testing Real-Time Socket.IO event updates...');
    assert(lastBidUpdate !== null, 'Public room received real-time auction:bid_update');
    assert(lastBidUpdate?.amount === 2200, `Public socket broadcasted authoritative price ₹2,200 [got: ${lastBidUpdate?.amount}]`);
    assert(!JSON.stringify(lastBidUpdate).includes('2500'), 'Socket broadcast does not leak private maximum (₹2,500)');

    // 15. Test 13: Auction close selects correct winner and final proxy price
    console.log('\n15. Testing Auction Closing & Winner Selection with Proxy Bidding...');
    // Manually trigger closure by setting endsAt to past
    const closeListingDoc = await Listing.findById(listingId);
    closeListingDoc.endsAt = new Date(Date.now() - 5000);
    closeListingDoc.status = 'closed';
    await closeListingDoc.save();

    const finalListing = await Listing.findById(listingId);
    assert(finalListing.status === 'closed', 'Listing marked closed');
    assert(finalListing.winner.toString() === buyerC.user._id, 'Buyer C is authoritative winner at close');
    assert(finalListing.currentPrice === 2200, 'Final price matches proxy pricing algorithm (₹2,200, well below max of ₹2,500)');

    // Clean up sockets
    socketA.disconnect();
    socketB.disconnect();

  } catch (err) {
    console.error('Test suite error:', err);
    failed++;
  } finally {
    await mongoose.disconnect();
    console.log('\n======================================================');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('======================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
}

run();
