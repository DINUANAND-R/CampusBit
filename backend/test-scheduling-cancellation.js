const mongoose = require('mongoose');
const { io } = require('socket.io-client');
const path = require('path');
const fs = require('fs');

const API = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (!(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type');
  const data = contentType && contentType.includes('application/json')
    ? await res.json()
    : await res.text();

  return { status: res.status, ok: res.ok, data };
}

// 1x1 valid PNG buffer helper
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

async function runSchedulingCancellationTests() {
  console.log('================================================================');
  console.log('🧪 CAMPUSBID SCHEDULED LISTINGS & CANCELLATION TEST SUITE');
  console.log('================================================================\n');

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

  // Connect to DB for direct inspections and background job invocation
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campusbid');
  const Listing = require('./models/Listing');
  const { publishDueListings } = require('./jobs/scheduledPublisher');

  try {
    const timestamp = Date.now();

    // Setup: Register Seller 1, Seller 2, and Bidder
    const seller1 = { username: `seller1_${timestamp}`, email: `seller1_${timestamp}@test.edu`, password: 'pass123' };
    const seller2 = { username: `seller2_${timestamp}`, email: `seller2_${timestamp}@test.edu`, password: 'pass123' };
    const bidder = { username: `bidder_${timestamp}`, email: `bidder_${timestamp}@test.edu`, password: 'pass123' };

    const s1Res = await api('/auth/register', { method: 'POST', body: seller1 });
    const s2Res = await api('/auth/register', { method: 'POST', body: seller2 });
    const bRes = await api('/auth/register', { method: 'POST', body: bidder });

    const s1Token = s1Res.data.access;
    const s2Token = s2Res.data.access;
    const bToken = bRes.data.access;

    assert('Test Setup: Register Seller 1, Seller 2, and Bidder', s1Token && s2Token && bToken);

    // ------------------------------------------------------------------------
    // SCENARIO 1: Publish Now creates an immediately active listing
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 1: Publish Now creates immediately active listing ---');
    const pubNowForm = new FormData();
    pubNowForm.append('title', `Publish Now Item ${timestamp}`);
    pubNowForm.append('description', 'Instant auction active immediately');
    pubNowForm.append('category', 'electronics');
    pubNowForm.append('condition', 'new');
    pubNowForm.append('startingPrice', '500');
    pubNowForm.append('minBidIncrement', '25');
    pubNowForm.append('durationHours', '24');
    pubNowForm.append('publishType', 'now');
    pubNowForm.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'item.png');

    const s1ListingRes = await api('/listings', { method: 'POST', body: pubNowForm, token: s1Token });
    assert(
      'Publish Now creates listing with status = active',
      s1ListingRes.status === 201 && s1ListingRes.data.listing.status === 'active'
    );
    const activeListingId = s1ListingRes.data.listing._id;

    // ------------------------------------------------------------------------
    // SCENARIO 2: A listing scheduled for tomorrow remains hidden from public users today
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 2: Tomorrow scheduled listing hidden from public ---');
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const schedForm = new FormData();
    schedForm.append('title', `Tomorrow Item ${timestamp}`);
    schedForm.append('description', 'Auction scheduled for tomorrow');
    schedForm.append('category', 'books');
    schedForm.append('condition', 'like-new');
    schedForm.append('startingPrice', '150');
    schedForm.append('minBidIncrement', '10');
    schedForm.append('durationHours', '48');
    schedForm.append('publishType', 'later');
    schedForm.append('publishAt', tomorrow.toISOString());
    schedForm.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'book.png');

    const schedRes = await api('/listings', { method: 'POST', body: schedForm, token: s1Token });
    assert(
      'Create scheduled listing returns status = scheduled and publishAt set',
      schedRes.status === 201 &&
      schedRes.data.listing.status === 'scheduled' &&
      new Date(schedRes.data.listing.publishAt).getTime() === tomorrow.getTime()
    );
    const scheduledListingId = schedRes.data.listing._id;

    // Verify public browse endpoint excludes it
    const publicListings = await api('/listings');
    const foundInPublic = publicListings.data.listings?.some((l) => l._id === scheduledListingId);
    assert('Scheduled listing is NOT returned in public search / feed', !foundInPublic);

    // Verify public detail view blocks it for unauthenticated or non-owner
    const unauthDetail = await api(`/listings/${scheduledListingId}`);
    assert('Unauthenticated user cannot view scheduled listing (404)', unauthDetail.status === 404);

    const nonOwnerDetail = await api(`/listings/${scheduledListingId}`, { token: s2Token });
    assert('Different user cannot view scheduled listing (404)', nonOwnerDetail.status === 404);

    const ownerDetail = await api(`/listings/${scheduledListingId}`, { token: s1Token });
    assert('Owner can view their own scheduled listing', ownerDetail.status === 200 && ownerDetail.data.listing.status === 'scheduled');

    // ------------------------------------------------------------------------
    // SCENARIO 3: A scheduled listing automatically becomes active at its publication time
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 3: Automatically publishes when publication time arrives ---');
    // Create a scheduled listing with publishAt in the near future, then fast-forward
    const dueTime = new Date(Date.now() - 2000); // 2 seconds in past
    await Listing.findByIdAndUpdate(scheduledListingId, { publishAt: dueTime });

    // Trigger scheduled publisher
    await publishDueListings(null);

    const publishedListing = await Listing.findById(scheduledListingId);
    assert(
      'Scheduled listing automatically transitions to status = active with publishedAt set',
      publishedListing.status === 'active' && Boolean(publishedListing.publishedAt)
    );

    // Now it appears in public feed
    const publicAfterPub = await api('/listings?limit=100');
    const foundAfterPub = publicAfterPub.data.listings?.some((l) => l._id === scheduledListingId);
    assert('Published listing is now visible in public browsing and search', foundAfterPub);

    // ------------------------------------------------------------------------
    // SCENARIO 4: A scheduled listing can be cancelled by its owner
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 4: Scheduled listing cancelled by owner ---');
    const schedForm2 = new FormData();
    schedForm2.append('title', `To Cancel Item ${timestamp}`);
    schedForm2.append('description', 'Scheduled listing to test owner cancellation');
    schedForm2.append('category', 'sports');
    schedForm2.append('condition', 'good');
    schedForm2.append('startingPrice', '300');
    schedForm2.append('durationHours', '24');
    schedForm2.append('publishType', 'later');
    schedForm2.append('publishAt', new Date(Date.now() + 3600000).toISOString());
    schedForm2.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'sport.png');

    const toCancelRes = await api('/listings', { method: 'POST', body: schedForm2, token: s1Token });
    const toCancelId = toCancelRes.data.listing._id;

    const cancelRes = await api(`/listings/${toCancelId}/cancel`, {
      method: 'PATCH',
      body: { reason: 'Decided not to sell after all' },
      token: s1Token,
    });
    assert(
      'Owner can cancel their scheduled listing before publication',
      cancelRes.status === 200 &&
      cancelRes.data.listing.status === 'cancelled' &&
      cancelRes.data.listing.cancellationReason === 'Decided not to sell after all'
    );

    // ------------------------------------------------------------------------
    // SCENARIO 5: A different user cannot cancel or edit the listing
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 5: Unauthorized cancel and edit forbidden ---');
    // Seller 2 attempts to cancel Seller 1's listing
    const unauthCancel = await api(`/listings/${activeListingId}/cancel`, {
      method: 'PATCH',
      body: { reason: 'Malicious cancellation' },
      token: s2Token,
    });
    assert('Different user cannot cancel listing (rejected with 403)', unauthCancel.status === 403);

    // Seller 2 attempts to edit Seller 1's listing
    const unauthEditForm = new FormData();
    unauthEditForm.append('title', 'Hacked Title');
    const unauthEdit = await api(`/listings/${activeListingId}`, {
      method: 'PATCH',
      body: unauthEditForm,
      token: s2Token,
    });
    assert('Different user cannot edit listing (rejected with 403)', unauthEdit.status === 403);

    // ------------------------------------------------------------------------
    // SCENARIO 6: An active auction without bids can be cancelled
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 6: Active auction without bids can be cancelled ---');
    const cancelActiveNoBids = await api(`/listings/${activeListingId}/cancel`, {
      method: 'PATCH',
      body: { reason: 'Item no longer available' },
      token: s1Token,
    });
    assert(
      'Active auction with 0 bids can be cancelled by seller',
      cancelActiveNoBids.status === 200 && cancelActiveNoBids.data.listing.status === 'cancelled'
    );

    // ------------------------------------------------------------------------
    // SCENARIO 7: An active auction with bids cannot be cancelled by the seller
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 7: Active auction with bids cannot be cancelled ---');
    // Create new active listing and place a bid
    const biddedForm = new FormData();
    biddedForm.append('title', `Bidded Item ${timestamp}`);
    biddedForm.append('description', 'Listing that will receive bids');
    biddedForm.append('category', 'clothing');
    biddedForm.append('condition', 'good');
    biddedForm.append('startingPrice', '100');
    biddedForm.append('minBidIncrement', '10');
    biddedForm.append('durationHours', '24');
    biddedForm.append('publishType', 'now');
    biddedForm.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'cloth.png');

    const biddedListingRes = await api('/listings', { method: 'POST', body: biddedForm, token: s1Token });
    const biddedListingId = biddedListingRes.data.listing._id;

    // Place bid
    const placeBidRes = await api('/bids', {
      method: 'POST',
      body: { listingId: biddedListingId, amount: 110 },
      token: bToken,
    });
    assert('Bid placed successfully on active auction', placeBidRes.status === 201);

    // Attempt cancellation
    const cancelWithBids = await api(`/listings/${biddedListingId}/cancel`, {
      method: 'PATCH',
      body: { reason: 'Trying to cancel with bids' },
      token: s1Token,
    });
    assert(
      'Active auction with bids cannot be cancelled by seller (400 rejected)',
      cancelWithBids.status === 400 && cancelWithBids.data.message.includes('cannot be cancelled because bidding has already started')
    );

    // ------------------------------------------------------------------------
    // SCENARIO 8: A cancelled listing rejects all new bids
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 8: Cancelled listing rejects all new bids ---');
    const bidOnCancelled = await api('/bids', {
      method: 'POST',
      body: { listingId: activeListingId, amount: 600 },
      token: bToken,
    });
    assert(
      'Cancelled listing rejects new bids (rejected with 400)',
      bidOnCancelled.status === 400 && bidOnCancelled.data.message.includes('not active')
    );

    // ------------------------------------------------------------------------
    // SCENARIO 9: Rescheduling updates the publication time correctly
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 9: Rescheduling updates publication time ---');
    // Create new scheduled listing
    const reschedForm = new FormData();
    reschedForm.append('title', `Reschedule Item ${timestamp}`);
    reschedForm.append('description', 'Testing rescheduling publication time');
    reschedForm.append('category', 'furniture');
    reschedForm.append('condition', 'fair');
    reschedForm.append('startingPrice', '400');
    reschedForm.append('durationHours', '12');
    reschedForm.append('publishType', 'later');
    reschedForm.append('publishAt', new Date(Date.now() + 2 * 3600000).toISOString());
    reschedForm.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'table.png');

    const reschedListingRes = await api('/listings', { method: 'POST', body: reschedForm, token: s1Token });
    const reschedListingId = reschedListingRes.data.listing._id;

    // Reschedule to 5 hours from now
    const newPublishTime = new Date(Date.now() + 5 * 3600000);
    const updateSchedForm = new FormData();
    updateSchedForm.append('publishAt', newPublishTime.toISOString());

    const updateRes = await api(`/listings/${reschedListingId}`, {
      method: 'PATCH',
      body: updateSchedForm,
      token: s1Token,
    });
    assert(
      'Rescheduling updates publishAt to new future timestamp and preserves end time duration',
      updateRes.status === 200 &&
      new Date(updateRes.data.listing.publishAt).getTime() === newPublishTime.getTime() &&
      new Date(updateRes.data.listing.endsAt) > newPublishTime
    );

    // ------------------------------------------------------------------------
    // SCENARIO 10: An invalid schedule or auction end time is rejected
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 10: Invalid schedule and end times rejected ---');
    // Past publishAt
    const pastSchedForm = new FormData();
    pastSchedForm.append('title', 'Past Sched');
    pastSchedForm.append('description', 'Invalid past publication time');
    pastSchedForm.append('category', 'books');
    pastSchedForm.append('condition', 'good');
    pastSchedForm.append('startingPrice', '100');
    pastSchedForm.append('publishType', 'later');
    pastSchedForm.append('publishAt', new Date(Date.now() - 3600000).toISOString());
    pastSchedForm.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'book.png');

    const pastSchedRes = await api('/listings', { method: 'POST', body: pastSchedForm, token: s1Token });
    assert('Past publication time rejected with 400', pastSchedRes.status === 400);

    // End time before publication time
    const invalidEndForm = new FormData();
    invalidEndForm.append('title', 'Invalid End Time');
    invalidEndForm.append('description', 'Closing time before publish time');
    invalidEndForm.append('category', 'books');
    invalidEndForm.append('condition', 'good');
    invalidEndForm.append('startingPrice', '100');
    invalidEndForm.append('publishType', 'later');
    const futurePub = new Date(Date.now() + 7200000);
    const earlierEnd = new Date(Date.now() + 3600000);
    invalidEndForm.append('publishAt', futurePub.toISOString());
    invalidEndForm.append('endsAt', earlierEnd.toISOString());
    invalidEndForm.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'book.png');

    const invalidEndRes = await api('/listings', { method: 'POST', body: invalidEndForm, token: s1Token });
    assert(
      'Auction closing time before publication time rejected with 400',
      invalidEndRes.status === 400 && invalidEndRes.data.message.includes('after the scheduled publication time')
    );

    // ------------------------------------------------------------------------
    // SCENARIO 11: Server restart does not leave overdue scheduled listings permanently unpublished
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 11: Server restart recovery for overdue listings ---');
    // Create an overdue scheduled listing in DB simulating server downtime
    const overdueListing = await Listing.create({
      seller: s1ListingRes.data.listing.seller,
      title: `Overdue Restart Item ${timestamp}`,
      description: 'Item became due while server was offline',
      category: 'other',
      condition: 'good',
      startingPrice: 200,
      images: [{ url: '/uploads/listings/dummy.png', filename: 'dummy.png' }],
      status: 'scheduled',
      publishAt: new Date(Date.now() - 60000), // 1 min ago
      endsAt: new Date(Date.now() + 24 * 3600000), // 24 hours in future
    });

    // Run publisher routine (same as on boot)
    await publishDueListings(null);

    const recoveredListing = await Listing.findById(overdueListing._id);
    assert(
      'Overdue scheduled listing automatically published on startup recovery',
      recoveredListing.status === 'active' && Boolean(recoveredListing.publishedAt)
    );

    // If an auction endsAt already passed before publication, verify it gets marked cancelled
    const expiredScheduled = await Listing.create({
      seller: s1ListingRes.data.listing.seller,
      title: `Expired Scheduled Item ${timestamp}`,
      description: 'Auction endsAt passed while scheduled',
      category: 'other',
      condition: 'good',
      startingPrice: 200,
      images: [{ url: '/uploads/listings/dummy.png', filename: 'dummy.png' }],
      status: 'scheduled',
      publishAt: new Date(Date.now() - 120000),
      endsAt: new Date(Date.now() - 60000), // expired!
    });

    await publishDueListings(null);
    const expiredResult = await Listing.findById(expiredScheduled._id);
    assert(
      'Expired scheduled listing is safely marked cancelled and never becomes active',
      expiredResult.status === 'cancelled' && expiredResult.cancellationReason.includes('passed before publication')
    );

    // ------------------------------------------------------------------------
    // SCENARIO 12: Existing image uploads, bidding, and auction closing still work
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 12: Multi-image upload, bidding, auto-close intact ---');
    const multiForm = new FormData();
    multiForm.append('title', `Multi-Image Item ${timestamp}`);
    multiForm.append('description', 'Testing multiple uploads together with scheduling system');
    multiForm.append('category', 'electronics');
    multiForm.append('condition', 'like-new');
    multiForm.append('startingPrice', '100');
    multiForm.append('minBidIncrement', '10');
    multiForm.append('durationHours', '24');
    multiForm.append('publishType', 'now');
    multiForm.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'img1.png');
    multiForm.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'img2.png');

    const multiRes = await api('/listings', { method: 'POST', body: multiForm, token: s1Token });
    assert(
      'Multi-image upload intact (2 images uploaded and saved)',
      multiRes.status === 201 && multiRes.data.listing.images.length === 2
    );

    // ------------------------------------------------------------------------
    // SCENARIO 13: Public APIs never expose scheduled or cancelled listings
    // ------------------------------------------------------------------------
    console.log('\n--- Scenario 13: Public APIs strict filtering ---');
    const allPublic = await api('/listings?limit=100');
    const hasScheduled = allPublic.data.listings?.some((l) => l.status === 'scheduled');
    const hasCancelled = allPublic.data.listings?.some((l) => l.status === 'cancelled');
    const hasFuturePublish = allPublic.data.listings?.some((l) => l.publishAt && new Date(l.publishAt) > new Date());

    assert('Public listings feed contains 0 scheduled listings', !hasScheduled);
    assert('Public listings feed contains 0 cancelled listings', !hasCancelled);
    assert('Public listings feed contains 0 listings with future publishAt', !hasFuturePublish);

    // Verify Seller Dashboard DOES include scheduled and cancelled listings
    const myDash = await api('/listings/my', { token: s1Token });
    const dashHasScheduled = myDash.data.listings?.some((l) => l.status === 'scheduled');
    const dashHasCancelled = myDash.data.listings?.some((l) => l.status === 'cancelled');
    assert('Seller dashboard shows owner scheduled listings', dashHasScheduled);
    assert('Seller dashboard shows owner cancelled listings', dashHasCancelled);

    console.log('\n====================================================');
    console.log(`🎉 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('Test run error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

runSchedulingCancellationTests();
