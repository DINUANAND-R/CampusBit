/**
 * Comprehensive Automated Test Suite for:
 * CampusBid Buyer-Seller Product Exchange Workflow & Real-Time Sync
 */

const { io } = require('socket.io-client');
const mongoose = require('mongoose');
const Listing = require('./models/Listing');
const Bid = require('./models/Bid');
const Exchange = require('./models/Exchange');
const Conversation = require('./models/Conversation');
const Notification = require('./models/Notification');
const User = require('./models/User');
const { createExchangeForClosedAuction } = require('./services/exchangeService');

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
    socket.on('connect', () => {
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      reject(err);
    });
  });
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campusbid');
  console.log('\n======================================================');
  console.log('🎯 Running CampusBid Product Exchange & Real-Time Test Suite');
  console.log('======================================================\n');

  try {
    const timestamp = Date.now();
    // 1. Setup Actors: Seller, Winning Buyer, Non-winner, Third party
    const seller = await registerOrLogin(
      `ex_seller_${timestamp}`,
      `ex_seller_${timestamp}@campus.edu`,
      'Password123!',
      `SEL${timestamp.toString().slice(-4)}`
    );
    const buyer1 = await registerOrLogin(
      `ex_buyer_${timestamp}`,
      `ex_buyer_${timestamp}@campus.edu`,
      'Password123!',
      `BUY${timestamp.toString().slice(-4)}`
    );
    const bystander = await registerOrLogin(
      `ex_other_${timestamp}`,
      `ex_other_${timestamp}@campus.edu`,
      'Password123!',
      `OTH${timestamp.toString().slice(-4)}`
    );

    console.log('1. Verifying Socket.IO Authenticated Connections & Rooms...');
    const sellerSocket = await createClientSocket(seller.token);
    sellerSocket.emit('user:auth', seller.user._id);

    const buyerSocket = await createClientSocket(buyer1.token);
    buyerSocket.emit('user:auth', buyer1.user._id);

    assert(sellerSocket.connected, 'Seller socket connected with real-time auth');
    assert(buyerSocket.connected, 'Buyer socket connected with real-time auth');

    // 2. Create Listing and Auction
    console.log('\n2. Creating auction listing and placing bids...');
    const formData = new FormData();
    formData.append('title', `MacBook Pro M2 - Exchange Test ${timestamp}`);
    formData.append('description', 'Excellent condition laptop for campus handover.');
    formData.append('category', 'electronics');
    formData.append('condition', 'like-new');
    formData.append('startingPrice', '45000');
    formData.append('minBidIncrement', '1000');
    formData.append('durationHours', '24');

    const pngBlob = new Blob([createPngBuffer()], { type: 'image/png' });
    formData.append('images', pngBlob, 'macbook.png');

    const listingRes = await fetch(`${BASE_URL}/listings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${seller.token}` },
      body: formData,
    });
    const listingData = await listingRes.json();
    assert(listingRes.status === 201, 'Seller successfully created auction listing', JSON.stringify(listingData));
    const listingId = listingData.listing._id;

    // Buyer places winning bid
    const bidRes = await req('/bids', {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyer1.token}` },
      body: JSON.stringify({ listingId, amount: 46000 }),
    });
    assert(bidRes.status === 201, 'Buyer successfully placed winning bid of ₹46,000', JSON.stringify(bidRes.data));

    // 3. Verify Auction Closure creates Exchange Record with Idempotency
    console.log('\n3. Testing Exchange creation upon auction closure...');
    
    // Setup listener for exchange:created on buyer and seller socket
    let sellerReceivedExchangeEvent = null;
    let buyerReceivedExchangeEvent = null;
    sellerSocket.on('exchange:created', (data) => { sellerReceivedExchangeEvent = data; });
    buyerSocket.on('exchange:created', (data) => { buyerReceivedExchangeEvent = data; });

    // Manually trigger auction closer service / exchange service
    const closedListing = await Listing.findById(listingId);
    closedListing.status = 'closed';
    closedListing.winner = buyer1.user._id;
    closedListing.currentPrice = 46000;
    await closedListing.save();

    // Call exchange creation
    const exchange = await createExchangeForClosedAuction(closedListing);
    assert(exchange && exchange._id, 'Exchange record successfully generated upon auction close');
    const exchangeId = exchange._id.toString();

    // Verify Idempotency: calling again should not duplicate
    const duplicateAttempt = await createExchangeForClosedAuction(closedListing);
    assert(duplicateAttempt && duplicateAttempt._id.toString() === exchangeId, 'Duplicate closure call handled gracefully (idempotent)');

    const exchangeCount = await Exchange.countDocuments({ listing: listingId });
    assert(exchangeCount === 1, `Exactly 1 exchange created for listing (actual: ${exchangeCount})`);

    // Verify properties of exchange
    const createdExchange = await Exchange.findById(exchangeId);
    assert(createdExchange.seller.toString() === seller.user._id, 'Exchange correctly links seller');
    assert(createdExchange.buyer.toString() === buyer1.user._id, 'Exchange correctly links buyer');
    assert(createdExchange.winningAmount === 46000, 'Exchange records authoritative winning amount');
    assert(createdExchange.status === 'READY_TO_ARRANGE', 'Initial exchange status is READY_TO_ARRANGE');
    assert(createdExchange.conversation, 'Dedicated private conversation is linked to exchange');

    // 4. Test Unsold Auction does NOT create an exchange
    console.log('\n4. Verifying unsold auction does not create an exchange...');
    const unsoldListing = new Listing({
      title: `Unsold Item ${timestamp}`,
      description: 'Nobody bid on this item',
      category: 'books',
      condition: 'good',
      startingPrice: 500,
      seller: seller.user._id,
      status: 'closed',
      winner: null,
      publishAt: new Date(),
      biddingStartsAt: new Date(),
      endsAt: new Date(),
      images: [{ url: '/uploads/listings/unsold.png', filename: 'unsold.png' }],
    });
    await unsoldListing.save();

    const unsoldResult = await createExchangeForClosedAuction(unsoldListing);
    assert(unsoldResult === null, 'Unsold auction rejected from exchange creation');
    const unsoldExchangeCount = await Exchange.countDocuments({ listing: unsoldListing._id });
    assert(unsoldExchangeCount === 0, 'No exchange record created for unsold auction');

    // 5. Test Access Control & Authorization on API
    console.log('\n5. Testing authorization & access control on /api/exchanges...');
    // Buyer can view
    const buyerGetRes = await req(`/exchanges/${exchangeId}`, {
      headers: { Authorization: `Bearer ${buyer1.token}` },
    });
    assert(buyerGetRes.status === 200, 'Buyer authorized to view exchange');

    // Seller can view
    const sellerGetRes = await req(`/exchanges/${exchangeId}`, {
      headers: { Authorization: `Bearer ${seller.token}` },
    });
    assert(sellerGetRes.status === 200, 'Seller authorized to view exchange');

    // Bystander CANNOT view
    const bystanderGetRes = await req(`/exchanges/${exchangeId}`, {
      headers: { Authorization: `Bearer ${bystander.token}` },
    });
    assert(bystanderGetRes.status === 403, 'Unauthorized third party is forbidden (403)');

    // Unauthenticated request gets 401
    const unauthGetRes = await req(`/exchanges/${exchangeId}`);
    assert(unauthGetRes.status === 401, 'Unauthenticated request rejected with 401');

    // 6. Test Handover Proposal Negotiation
    console.log('\n6. Testing Handover proposal negotiation...');
    let buyerReceivedUpdate = null;
    buyerSocket.on('exchange:update', (data) => { buyerReceivedUpdate = data; });

    const proposalDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const proposalRes = await req(`/exchanges/${exchangeId}/handover-proposals`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${seller.token}` },
      body: JSON.stringify({
        proposedDate: proposalDate,
        proposedTime: '15:30',
        location: 'Central Library South Entrance, 1st Floor',
        notes: 'I will be wearing a blue hoodie with the MacBook in a grey sleeve.',
      }),
    });

    assert(proposalRes.status === 200, 'Seller proposed handover arrangement successfully');
    assert(proposalRes.data.exchange.handoverProposal?.status === 'PROPOSED', 'Proposal state is PROPOSED');
    assert(proposalRes.data.exchange.handoverProposal?.proposedBy === 'seller', 'Proposal correctly attributed to seller');

    await new Promise((r) => setTimeout(r, 400));
    assert(buyerReceivedUpdate !== null, 'Buyer received real-time exchange:update socket event with proposal');

    // 7. Testing Proposal Rejection and Counter-Proposal
    console.log('\n7. Testing proposal decline and counter-proposal...');
    const rejectRes = await req(`/exchanges/${exchangeId}/handover-proposals/current/respond`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${buyer1.token}` },
      body: JSON.stringify({ action: 'decline' }),
    });
    assert(rejectRes.status === 200, 'Buyer successfully declined seller proposal');
    assert(rejectRes.data.exchange.handoverProposal?.status === 'DECLINED', 'Proposal status transitioned to DECLINED');

    // Buyer makes counter-proposal
    const counterProposalRes = await req(`/exchanges/${exchangeId}/handover-proposals`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyer1.token}` },
      body: JSON.stringify({
        proposedDate: proposalDate,
        proposedTime: '17:00',
        location: 'Student Activity Center, Main Lounge',
        notes: 'How about after classes at 5:00 PM?',
      }),
    });
    assert(counterProposalRes.status === 200, 'Buyer proposed counter-arrangement');
    assert(counterProposalRes.data.exchange.handoverProposal?.proposedBy === 'buyer', 'Counter-proposal attributed to buyer');

    // Seller accepts counter-proposal
    const acceptRes = await req(`/exchanges/${exchangeId}/handover-proposals/current/respond`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${seller.token}` },
      body: JSON.stringify({ action: 'accept' }),
    });
    assert(acceptRes.status === 200, 'Seller accepted buyer counter-proposal');
    assert(acceptRes.data.exchange.status === 'HANDOVER_SCHEDULED', 'Exchange transitioned to HANDOVER_SCHEDULED');

    // 8. Testing Two-Party Handover Confirmation Security
    console.log('\n8. Testing Two-Party Handover confirmation & validation...');
    // Buyer CANNOT confirm on behalf of seller
    const spoofSellerRes = await req(`/exchanges/${exchangeId}/confirm-handover`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyer1.token}` },
      body: JSON.stringify({ role: 'seller' }),
    });
    assert(spoofSellerRes.status === 403, 'Buyer is strictly blocked from confirming seller handover (403)');

    // Seller CANNOT confirm on behalf of buyer
    const spoofBuyerRes = await req(`/exchanges/${exchangeId}/confirm-handover`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${seller.token}` },
      body: JSON.stringify({ role: 'buyer' }),
    });
    assert(spoofBuyerRes.status === 403, 'Seller is strictly blocked from confirming buyer receipt (403)');

    // Seller marks product as handed over
    const sellerConfirmRes = await req(`/exchanges/${exchangeId}/confirm-handover`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${seller.token}` },
      body: JSON.stringify({ role: 'seller', note: 'Item delivered to buyer in person' }),
    });
    assert(sellerConfirmRes.status === 200, 'Seller successfully confirmed physical handover');
    assert(sellerConfirmRes.data.exchange.sellerHandedOverAt !== null, 'Seller handover timestamp recorded');
    assert(sellerConfirmRes.data.exchange.status === 'HANDED_OVER', 'Exchange status updated to HANDED_OVER');
    assert(!sellerConfirmRes.data.exchange.completedAt, 'Exchange not yet marked completed (awaiting buyer)');

    // Buyer marks product as received
    const buyerConfirmRes = await req(`/exchanges/${exchangeId}/confirm-handover`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyer1.token}` },
      body: JSON.stringify({ role: 'buyer', note: 'Laptop tested and received in great shape' }),
    });
    assert(buyerConfirmRes.status === 200, 'Buyer successfully confirmed product receipt');
    assert(buyerConfirmRes.data.exchange.buyerReceivedAt !== null, 'Buyer receipt timestamp recorded');
    assert(buyerConfirmRes.data.exchange.status === 'COMPLETED', 'Exchange transitioned to COMPLETED when both confirmed');
    assert(buyerConfirmRes.data.exchange.completedAt !== null, 'CompletedAt timestamp recorded');

    // Verify underlying listing updated to 'completed'
    const finalListing = await Listing.findById(listingId);
    assert(finalListing.status === 'completed', 'Listing status updated to completed in sync');

    // 9. Testing Audit Trail & History endpoint
    console.log('\n9. Testing Exchange audit history...');
    const historyRes = await req(`/exchanges/${exchangeId}/history`, {
      headers: { Authorization: `Bearer ${buyer1.token}` },
    });
    assert(historyRes.status === 200, 'History retrieved successfully');
    assert(Array.isArray(historyRes.data.history), 'History is an array');
    assert(historyRes.data.history.length >= 4, `Audit history contains all key lifecycle events (${historyRes.data.history.length} events)`);

    // 10. Testing Dispute Workflow on a Separate Exchange
    console.log('\n10. Testing Dispute workflow...');
    // Create a 2nd listing for dispute testing
    const disputeListing = new Listing({
      title: `Dispute Test Item ${timestamp}`,
      description: 'Item with condition conflict',
      category: 'electronics',
      condition: 'good',
      startingPrice: 2000,
      seller: seller.user._id,
      winner: buyer1.user._id,
      currentPrice: 2500,
      status: 'closed',
      publishAt: new Date(),
      biddingStartsAt: new Date(),
      endsAt: new Date(),
      images: [{ url: '/uploads/listings/dispute.png', filename: 'dispute.png' }],
    });
    await disputeListing.save();

    const dispExRes = await createExchangeForClosedAuction(disputeListing);
    const dispExId = dispExRes._id.toString();

    // Buyer raises dispute
    const disputeRes = await req(`/exchanges/${dispExId}/disputes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyer1.token}` },
      body: JSON.stringify({
        reason: 'Item screen was broken upon inspection, contrary to description.',
        details: 'Buyer brought device that was clearly dropped. Refused to accept.',
      }),
    });
    assert(disputeRes.status === 200 || disputeRes.status === 201, 'Dispute raised successfully');
    assert(disputeRes.data.exchange.status === 'DISPUTED', 'Status moved to DISPUTED');
    assert(disputeRes.data.exchange.dispute?.raisedBy?.toString() === buyer1.user._id, 'Dispute correctly references buyer');

    // Verify history recorded the dispute
    const dispHistory = await req(`/exchanges/${dispExId}/history`, {
      headers: { Authorization: `Bearer ${seller.token}` },
    });
    const hasDisputeEvent = dispHistory.data.history.some((h) => h.action === 'DISPUTE_RAISED');
    assert(hasDisputeEvent, 'Dispute action permanently logged in transaction history');

    // 11. Testing In-App Notifications Persistence for Exchanges
    console.log('\n11. Testing Persisted Notifications for exchange events...');
    const sellerNotifs = await Notification.find({ recipient: seller.user._id }).sort({ createdAt: -1 });
    assert(sellerNotifs.length > 0, 'Notifications created and persisted in MongoDB for seller');
    const hasExchangeNotif = sellerNotifs.some((n) => n.message?.toLowerCase().includes('handover') || n.message?.toLowerCase().includes('exchange') || n.title?.toLowerCase().includes('handover') || n.title?.toLowerCase().includes('dispute'));
    assert(hasExchangeNotif, 'Exchange-specific notification exists for seller');

    // 12. Testing My Transactions Dashboard list endpoint with role filtering
    console.log('\n12. Testing GET /api/exchanges listing & filter options...');
    const buyerAllRes = await req('/exchanges', {
      headers: { Authorization: `Bearer ${buyer1.token}` },
    });
    assert(buyerAllRes.status === 200, 'Buyer retrieved exchange list');
    assert(buyerAllRes.data.exchanges.length >= 2, 'Buyer sees all their transactions');

    const buyerAsBuyerRes = await req('/exchanges?role=buyer', {
      headers: { Authorization: `Bearer ${buyer1.token}` },
    });
    assert(buyerAsBuyerRes.status === 200, 'Role filter role=buyer works');
    assert(buyerAsBuyerRes.data.exchanges.every((e) => e.buyer._id === buyer1.user._id), 'All results match role=buyer');

    const statusFilterRes = await req('/exchanges?status=COMPLETED', {
      headers: { Authorization: `Bearer ${buyer1.token}` },
    });
    assert(statusFilterRes.status === 200, 'Status filter status=COMPLETED works');
    assert(statusFilterRes.data.exchanges.every((e) => e.status === 'COMPLETED'), 'All results match status=COMPLETED');

    // Clean up sockets
    sellerSocket.disconnect();
    buyerSocket.disconnect();

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
