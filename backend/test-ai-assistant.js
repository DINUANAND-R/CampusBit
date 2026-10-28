/**
 * Comprehensive Automated Test Suite for:
 * CampusBid Rule-Based AI Shopping Assistant (No API Key)
 */

const mongoose = require('mongoose');
require('./models/User');
require('./models/Listing');
require('./models/Bid');
require('./models/ProxyBid');
const { parseMessage, parseRawAmount } = require('./services/assistantService');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000/api';

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
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} - ${details}`);
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
  console.log('\n====================================================');
  console.log('🤖 CAMPUSBID RULE-BASED AI ASSISTANT TEST SUITE');
  console.log('====================================================\n');

  // ── 1. Unit Tests for Number, Currency & Synonym Parsing ──────────
  console.log('--- 1. Natural Language & Currency Parsing Tests ---');

  assert(parseRawAmount('2000') === 2000, 'Parses plain integer "2000"');
  assert(parseRawAmount('₹2,000') === 2000, 'Parses formatted currency "₹2,000"');
  assert(parseRawAmount('2k') === 2000, 'Parses shorthand "2k" -> 2000');
  assert(parseRawAmount('15k') === 15000, 'Parses shorthand "15k" -> 15000');
  assert(parseRawAmount('2.5k') === 2500, 'Parses decimal shorthand "2.5k" -> 2500');
  assert(parseRawAmount('2 thousand') === 2000, 'Parses word unit "2 thousand" -> 2000');
  assert(parseRawAmount('15 thousand') === 15000, 'Parses word unit "15 thousand" -> 15000');

  // Test budget phrases
  const p1 = parseMessage('Find me a cycle under ₹2,000');
  assert(p1.category === 'sports', 'Identifies "cycle" as sports category');
  assert(p1.maxPrice === 2000, 'Extracts max budget 2000 from "under ₹2,000"');

  const p2 = parseMessage('I need a used laptop below 15000');
  assert(p2.category === 'electronics', 'Identifies "laptop" as electronics category');
  assert(p2.condition === 'fair', 'Identifies "used" condition as fair');
  assert(p2.maxPrice === 15000, 'Extracts max budget 15000 from "below 15000"');

  const p3 = parseMessage('Show calculators between 200 and 500 rupees');
  assert(p3.minPrice === 200 && p3.maxPrice === 500, 'Extracts range 200 to 500 rupees');
  assert(p3.keywords.includes('calculators'), 'Extracts calculator keyword');

  const p4 = parseMessage('Find a good bicycle');
  assert(p4.category === 'sports', 'Identifies "bicycle" synonym for sports');
  assert(p4.condition === 'good', 'Identifies "good" condition');
  assert(p4.maxPrice === null, 'No budget assumes null maxPrice');

  const p5 = parseMessage('Show electronics in good condition');
  assert(p5.category === 'electronics', 'Identifies "electronics" category');
  assert(p5.condition === 'good', 'Identifies "good" condition');

  const p6 = parseMessage('What auctions are ending soon?');
  assert(p6.isEndingSoon === true, 'Identifies ending soon intent');

  const p7 = parseMessage('Compare two cycles');
  assert(p7.intent === 'COMPARE_LISTINGS', 'Identifies compare listings intent');
  // Confirm "2" is not mistaken for a ₹2 budget!
  assert(p7.maxPrice === null, 'Does not treat count "two" as a ₹2 budget');

  const p8 = parseMessage('Help me bid on a product');
  assert(p8.intent === 'BID_HELP', 'Identifies bid help intent');

  // ── 2. Real Database Search & Public Visibility Tests ──────────────
  console.log('\n--- 2. Live Database Search & Assistant API Tests ---');

  const seller = await registerOrLogin(
    `ai_seller_${Date.now()}`,
    `ai_seller_${Date.now()}@campus.edu`,
    'SellerPass123!'
  );
  const buyer = await registerOrLogin(
    `ai_buyer_${Date.now()}`,
    `ai_buyer_${Date.now()}@campus.edu`,
    'BuyerPass123!'
  );

// Generate a valid minimal 1x1 PNG buffer
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

  // Create an active cycle listing
  const cycleFormData = new FormData();
  cycleFormData.append('title', 'Hero Sprint Pro Cycle 21 Speed');
  cycleFormData.append('description', 'High performance mountain cycle, gently used for campus commute.');
  cycleFormData.append('category', 'sports');
  cycleFormData.append('condition', 'good');
  cycleFormData.append('startingPrice', '1500');
  cycleFormData.append('minBidIncrement', '50');
  cycleFormData.append('durationHours', '48');
  const imgBlob1 = new Blob([createPngBuffer()], { type: 'image/png' });
  cycleFormData.append('images', imgBlob1, 'cycle.png');

  const createCycleRes = await fetch(`${BASE_URL}/listings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${seller.token}` },
    body: cycleFormData,
  });
  const cycleData = await createCycleRes.json();
  assert(createCycleRes.status === 201, 'Created active cycle listing (₹1500 starting price)');

  // Create an active laptop listing (₹12000)
  const laptopFormData = new FormData();
  laptopFormData.append('title', 'Lenovo ThinkPad Core i5 Laptop');
  laptopFormData.append('description', 'Solid student laptop with 16GB RAM and SSD.');
  laptopFormData.append('category', 'electronics');
  laptopFormData.append('condition', 'like-new');
  laptopFormData.append('startingPrice', '12000');
  laptopFormData.append('minBidIncrement', '100');
  laptopFormData.append('durationHours', '12');
  const imgBlob2 = new Blob([createPngBuffer()], { type: 'image/png' });
  laptopFormData.append('images', imgBlob2, 'laptop.png');

  const createLaptopRes = await fetch(`${BASE_URL}/listings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${seller.token}` },
    body: laptopFormData,
  });
  const laptopData = await createLaptopRes.json();
  assert(createLaptopRes.status === 201, 'Created active laptop listing (₹12000 starting price)');

  // Create a scheduled listing (starts in 24 hours - MUST be excluded from search)
  const scheduledFormData = new FormData();
  scheduledFormData.append('title', 'Secret Future Bicycle Not Yet Live');
  scheduledFormData.append('description', 'Scheduled cycle listing');
  scheduledFormData.append('category', 'sports');
  scheduledFormData.append('condition', 'new');
  scheduledFormData.append('startingPrice', '1000');
  scheduledFormData.append('publishType', 'scheduled');
  scheduledFormData.append('publishAt', new Date(Date.now() + 24 * 3600 * 1000).toISOString());
  scheduledFormData.append('durationHours', '48');
  const imgBlob3 = new Blob([createPngBuffer()], { type: 'image/png' });
  scheduledFormData.append('images', imgBlob3, 'scheduled.png');

  const createSchedRes = await fetch(`${BASE_URL}/listings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${seller.token}` },
    body: scheduledFormData,
  });
  assert(createSchedRes.status === 201, 'Created scheduled cycle listing (must be private)');

  // Test Assistant Chat API: Find cycle under ₹2,000
  const searchCycleRes = await req('/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({ message: 'Find me a cycle under ₹2,000' }),
  });
  assert(searchCycleRes.status === 200, 'POST /api/assistant/chat returns 200 OK');
  assert(searchCycleRes.data.intent === 'SEARCH_LISTINGS', 'Response has intent SEARCH_LISTINGS');
  assert(Array.isArray(searchCycleRes.data.listings) && searchCycleRes.data.listings.length > 0, 'Returns listings array');
  const foundCycle = searchCycleRes.data.listings.find((l) => l._id === cycleData.listing._id);
  assert(!!foundCycle, 'Real cycle listing returned in search results');
  assert(foundCycle.currentPrice === 1500, 'Price correctly reflects ₹1,500');
  assert(foundCycle.priceType === 'Starting price', 'Correctly labeled as "Starting price" before bids');

  // Verify scheduled listing is NOT returned
  const foundScheduled = searchCycleRes.data.listings.find((l) => l.title.includes('Secret Future Bicycle'));
  assert(!foundScheduled, 'Scheduled listing is strictly excluded from assistant search');

  // Test Assistant Chat API: Search laptop under 15k
  const searchLaptopRes = await req('/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({ message: 'Show Lenovo laptops under 15k' }),
  });
  assert(searchLaptopRes.status === 200, 'POST /api/assistant/chat with "15k" returns 200 OK');
  const foundLaptop = searchLaptopRes.data.listings.find((l) => l._id === laptopData.listing._id);
  assert(!!foundLaptop, 'Lenovo ThinkPad returned for "laptops under 15k"');

  // Test Assistant Chat API: Search with strict budget where item exceeds
  const searchBudgetExceeded = await req('/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({ message: 'Show laptops under ₹5,000' }),
  });
  const exceededLaptop = searchBudgetExceeded.data.listings.find((l) => l._id === laptopData.listing._id);
  assert(!exceededLaptop, '₹12,000 laptop correctly excluded when budget is ₹5,000');

  // Test Range Query: "between 1000 and 2000 rupees"
  const searchRangeRes = await req('/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({ message: 'Find sports equipment between 1000 and 2000 rupees' }),
  });
  const rangeCycle = searchRangeRes.data.listings.find((l) => l._id === cycleData.listing._id);
  assert(!!rangeCycle, 'Cycle matches range between 1000 and 2000 rupees');

  // ── 3. Privacy & Security Tests ────────────────────────────────────
  console.log('\n--- 3. Privacy, Security & Sanitization Tests ---');

  // Verify seller private info is never exposed
  assert(foundCycle.seller.username === seller.user.username, 'Seller username is present');
  assert(foundCycle.seller.email === undefined, 'Seller email is NOT exposed in listing object');
  assert(foundCycle.seller.passwordHash === undefined, 'Seller passwordHash is NOT exposed');

  // Place a proxy bid as buyer to ensure private maxAmount is never returned to public
  const proxyRes = await req('/bids/proxy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyer.token}` },
    body: JSON.stringify({ listingId: cycleData.listing._id, maxAmount: 2500 }),
  });
  assert(proxyRes.status === 200, 'Buyer placed proxy bid of ₹2,500');

  // Repeat search: price should now be Current bid: ₹1550 (starting + increment)
  const searchAfterBid = await req('/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({ message: 'Find cycle under ₹2,000' }),
  });
  const cycleAfterBid = searchAfterBid.data.listings.find((l) => l._id === cycleData.listing._id);
  assert(cycleAfterBid.currentPrice === 1550, 'Current price updated to ₹1,550');
  assert(cycleAfterBid.priceType === 'Current bid', 'Labeled as "Current bid" after bid placed');
  assert(cycleAfterBid.bidCount === 1, 'Bid count accurately reflects 1 bid');
  assert(cycleAfterBid.proxyBids === undefined, 'Private proxy bids array is NOT exposed in public assistant results');
  assert(cycleAfterBid.maxAmount === undefined, 'Private maxAmount is NOT exposed');

  // Test NoSQL Injection & Malformed input handling
  const injectionRes = await req('/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({ message: '{"$gt": ""}' }),
  });
  assert(injectionRes.status === 200, 'Handles malicious NoSQL characters gracefully');

  const emptyMsgRes = await req('/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({ message: '' }),
  });
  assert(emptyMsgRes.status === 200 && emptyMsgRes.data.intent === 'EMPTY', 'Handles empty string gracefully');

  const ambiguousRes = await req('/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({ message: 'show me stuff' }),
  });
  assert(ambiguousRes.data.intent === 'AMBIGUOUS', 'Flags ambiguous query with clarifying follow-up question');

  // ── 4. Product Comparison Tests ───────────────────────────────────
  console.log('\n--- 4. Product Comparison Engine Tests ---');

  const compRes = await req('/assistant/compare', {
    method: 'POST',
    body: JSON.stringify({
      listingIds: [cycleData.listing._id, laptopData.listing._id],
    }),
  });
  assert(compRes.status === 200, 'POST /api/assistant/compare returns 200 OK');
  assert(compRes.data.comparison !== null, 'Comparison object returned');
  assert(compRes.data.comparison.itemA.title.includes('Hero Sprint'), 'Comparison itemA is cycle');
  assert(compRes.data.comparison.itemB.title.includes('ThinkPad'), 'Comparison itemB is laptop');
  assert(compRes.data.comparison.priceDifference > 0, 'Computes price difference accurately');
  assert(compRes.data.comparison.verdict.length > 20, 'Generates objective data-backed verdict');

  // Compare via conversational chat
  const chatCompRes = await req('/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({
      message: 'Compare cycles and laptops',
    }),
  });
  assert(chatCompRes.status === 200, 'Chat comparison query succeeds');
  assert(chatCompRes.data.intent === 'COMPARE_LISTINGS', 'Chat recognizes COMPARE_LISTINGS intent');

  // ── 5. Auctions Ending Soon Tests ─────────────────────────────────
  console.log('\n--- 5. Auctions Ending Soon Tests ---');

  const endingSoonRes = await req('/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({ message: 'Show auctions ending soon' }),
  });
  assert(endingSoonRes.status === 200, 'Ending soon query succeeds');
  assert(endingSoonRes.data.listings.length > 0, 'Returns active auctions sorted by ending soonest');
  if (endingSoonRes.data.listings.length >= 2) {
    const t0 = new Date(endingSoonRes.data.listings[0].endsAt).getTime();
    const t1 = new Date(endingSoonRes.data.listings[1].endsAt).getTime();
    assert(t0 <= t1, 'Auctions ending soon are sorted in ascending order of endsAt');
  }

  // ── 6. Cleanup ───────────────────────────────────────────────────
  console.log('\n--- Cleaning up test records ---');
  await mongoose.model('Listing').deleteMany({
    _id: { $in: [cycleData.listing._id, laptopData.listing._id, createSchedRes.data?.listing?._id].filter(Boolean) },
  });
  await mongoose.model('Bid').deleteMany({ listing: cycleData.listing._id });
  await mongoose.model('ProxyBid').deleteMany({ listing: cycleData.listing._id });
  await mongoose.model('User').deleteMany({
    _id: { $in: [seller.user._id, buyer.user._id] },
  });

  console.log('\n====================================================');
  console.log(`📊 ASSISTANT TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================\n');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
