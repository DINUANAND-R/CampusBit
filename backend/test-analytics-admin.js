/**
 * Comprehensive Automated Test Suite for:
 * 1. Seller Analytics Dashboard & APIs
 * 2. Admin Dashboard & Platform Moderation APIs
 * 3. Role-Based Authorization & Security Rules
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000/api';

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

async function req(url, options = {}) {
  const headers = { ...options.headers };
  const isForm = options.body instanceof FormData;
  if (!isForm && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

let sellerToken = '';
let sellerUser = null;
let seller2Token = '';
let seller2User = null;
let adminToken = '';
let adminUser = null;

let sellerListingId = '';
let seller2ListingId = '';

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

async function run() {
  console.log('\n========================================');
  console.log('🧪 CampusBid: Seller Analytics & Admin Tests');
  console.log('========================================\n');

  const ts = Date.now();
  const sellerCreds = {
    username: `seller_${ts}`,
    email: `seller_${ts}@test.campus.edu`,
    password: 'Password123!',
    campusId: `S${ts.toString().slice(-6)}`
  };
  const seller2Creds = {
    username: `seller2_${ts}`,
    email: `seller2_${ts}@test.campus.edu`,
    password: 'Password123!',
    campusId: `S2${ts.toString().slice(-5)}`
  };
  const adminCreds = {
    username: `admin_${ts}`,
    email: `admin_${ts}@test.campus.edu`,
    password: 'Password123!',
    campusId: `A${ts.toString().slice(-6)}`
  };

  // 1. Setup users
  console.log('1. Setting up Test Users...');
  const regSeller = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify(sellerCreds)
  });
  assert(regSeller.ok && regSeller.data?.access, 'Register primary seller');
  sellerToken = regSeller.data.access;
  sellerUser = regSeller.data.user;

  const regSeller2 = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify(seller2Creds)
  });
  assert(regSeller2.ok && regSeller2.data?.access, 'Register secondary seller');
  seller2Token = regSeller2.data.access;
  seller2User = regSeller2.data.user;

  const regAdmin = await req('/auth/register', {
    method: 'POST',
    body: JSON.stringify(adminCreds)
  });
  assert(regAdmin.ok && regAdmin.data?.access, 'Register admin user candidate');
  adminToken = regAdmin.data.access;
  adminUser = regAdmin.data.user;

  // Verify regular user role defaults to 'student'
  assert(adminUser.role === 'student', 'New user role defaults to "student" (no self-escalation)');

  // Promote admin via CLI promote logic
  console.log('\n2. Promoting Admin Candidate via CLI Script logic...');
  const { execSync } = require('child_process');
  try {
    const output = execSync(`node scripts/promote-admin.js ${adminCreds.username}`, { cwd: __dirname }).toString();
    const isPromoted = output.toLowerCase().includes('promoted') || output.toLowerCase().includes('already');
    assert(isPromoted, 'promote-admin.js executed successfully');
    
    // Re-login as admin to verify token/role
    const adminLogin = await req('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: adminCreds.email, password: adminCreds.password })
    });
    assert(adminLogin.ok && adminLogin.data?.user?.role === 'admin', 'Admin login reflects role="admin"');
    adminToken = adminLogin.data.access;
  } catch (err) {
    console.error('Error promoting admin:', err.message);
  }

  // 3. Create listings for seller
  console.log('\n3. Creating Listings for Sellers with Images...');
  const form1 = new FormData();
  form1.append('title', `Analytics Laptop ${ts}`);
  form1.append('description', 'MacBook Pro for campus bidding');
  form1.append('category', 'electronics');
  form1.append('condition', 'like-new');
  form1.append('startingPrice', '500');
  form1.append('minBidIncrement', '50');
  form1.append('durationHours', '24');
  form1.append('publishType', 'now');
  form1.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'laptop.png');

  const listing1Res = await req('/listings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sellerToken}` },
    body: form1
  });
  assert(listing1Res.ok, 'Create active listing for seller 1 with image');
  sellerListingId = listing1Res.data?.listing?._id;

  const form2 = new FormData();
  form2.append('title', `Seller2 Textbook ${ts}`);
  form2.append('description', 'Physics textbook');
  form2.append('category', 'books');
  form2.append('condition', 'good');
  form2.append('startingPrice', '100');
  form2.append('minBidIncrement', '10');
  form2.append('durationHours', '24');
  form2.append('publishType', 'now');
  form2.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'book.png');

  const listing2Res = await req('/listings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${seller2Token}` },
    body: form2
  });
  assert(listing2Res.ok, 'Create active listing for seller 2 with image');
  seller2ListingId = listing2Res.data?.listing?._id;

  // Place bid on seller 1's listing using seller 2
  const bidRes = await req('/bids', {
    method: 'POST',
    headers: { Authorization: `Bearer ${seller2Token}` },
    body: JSON.stringify({ listingId: sellerListingId, amount: 550 })
  });
  assert(bidRes.ok, 'Place bid of 550 on seller 1 listing');

  // Trigger view on seller 1 listing
  await req(`/listings/${sellerListingId}`);

  // 4. Test Seller Analytics Endpoints
  console.log('\n4. Testing Seller Analytics Endpoints & Isolation...');

  // Unauthenticated request rejected
  const unauthSeller = await req('/seller/analytics/overview');
  assert(unauthSeller.status === 401, 'Unauthenticated request to seller analytics rejected with 401');

  // Overview
  const sellerOverview = await req('/seller/analytics/overview?range=30d', {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert(sellerOverview.ok, 'Seller retrieves overview analytics');
  const ov = sellerOverview.data?.metrics;
  assert(ov?.totalListings >= 1, `Seller total listings counted correctly: ${ov?.totalListings}`);
  assert(ov?.totalBids >= 1, `Seller total bids counted correctly: ${ov?.totalBids}`);
  assert(ov?.uniqueBidders >= 1, `Seller unique bidders counted: ${ov?.uniqueBidders}`);
  assert(ov?.listingsWithBidsCount >= 1, `Seller listings with bids counted: ${ov?.listingsWithBidsCount}`);
  assert(ov?.totalViews >= 1, `Listing view tracking counted: ${ov?.totalViews}`);

  // Trends
  const sellerTrends = await req('/seller/analytics/trends?range=30d', {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert(sellerTrends.ok && Array.isArray(sellerTrends.data?.timeline), 'Seller retrieves daily timeline trends');
  assert(sellerTrends.data?.statusDistribution !== undefined, 'Seller retrieves status distribution breakdown');
  assert(Array.isArray(sellerTrends.data?.priceComparisons), 'Seller retrieves price comparisons list');

  // Listings Analytics Table
  const sellerListingsTable = await req('/seller/analytics/listings?page=1&limit=10', {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert(sellerListingsTable.ok && sellerListingsTable.data?.listings?.length >= 1, 'Seller retrieves own listings analytics table');

  // Single Listing Analytics
  const singleListingAnalytics = await req(`/seller/analytics/listings/${sellerListingId}`, {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert(singleListingAnalytics.ok && singleListingAnalytics.data?.listing?._id === sellerListingId, 'Seller retrieves single listing analytics');

  // Cross-seller isolation: seller2 tries to access seller1's private single listing analytics
  const crossAccess = await req(`/seller/analytics/listings/${sellerListingId}`, {
    headers: { Authorization: `Bearer ${seller2Token}` }
  });
  assert(crossAccess.status === 403, 'Cross-seller access to another seller\'s private analytics rejected with 403 Forbidden');

  // 5. Test Admin Role-Based Protection
  console.log('\n5. Testing Admin Role-Based Access Control...');

  // Non-admin student attempts to access admin endpoints
  const studentAdminAccess = await req('/admin/overview', {
    headers: { Authorization: `Bearer ${sellerToken}` }
  });
  assert(studentAdminAccess.status === 403, 'Non-admin user blocked from /api/admin/overview with 403 Forbidden');

  // Unauthenticated request to admin endpoint
  const unauthAdminAccess = await req('/admin/overview');
  assert(unauthAdminAccess.status === 401, 'Unauthenticated access to /api/admin/overview rejected with 401');

  // Admin user accesses admin overview
  const adminOverview = await req('/admin/overview?range=30d', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(adminOverview.ok, 'Admin retrieves platform overview');
  const aMetrics = adminOverview.data?.metrics;
  assert(aMetrics?.totalUsers >= 3, `Admin sees total registered users: ${aMetrics?.totalUsers}`);
  assert(aMetrics?.totalListings >= 2, `Admin sees total platform listings: ${aMetrics?.totalListings}`);
  assert(aMetrics?.totalBids >= 1, `Admin sees total platform bids: ${aMetrics?.totalBids}`);
  assert(Array.isArray(adminOverview.data?.recentActivity?.recentUsers), 'Admin overview includes recent users activity feed');

  // 6. Test Admin User Management
  console.log('\n6. Testing Admin User Management...');
  const usersList = await req('/admin/users?page=1&limit=10', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(usersList.ok && usersList.data?.users?.length >= 3, 'Admin retrieves paginated user list');

  // Admin inspects user detail
  const userDetail = await req(`/admin/users/${sellerUser._id}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(userDetail.ok && userDetail.data?.user?._id === sellerUser._id, 'Admin retrieves specific user detail and statistics');

  // Admin suspends user
  const suspendRes = await req(`/admin/users/${sellerUser._id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ action: 'suspend', reason: 'Violation of campus auction guidelines' })
  });
  assert(suspendRes.ok && suspendRes.data?.user?.status === 'suspended', 'Admin successfully suspends user account');

  // Verify suspended user token is immediately rejected on protected routes
  const suspendedAccess = await req('/listings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sellerToken}` },
    body: JSON.stringify({ title: 'Illegal post' })
  });
  assert(suspendedAccess.status === 403 && suspendedAccess.data?.message?.includes('suspended'), 'Suspended user token is rejected on authenticated routes with 403');

  // Admin reinstates user
  const reinstateRes = await req(`/admin/users/${sellerUser._id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ action: 'reinstate', reason: 'Appeal accepted' })
  });
  assert(reinstateRes.ok && reinstateRes.data?.user?.status === 'active', 'Admin successfully reinstates user account to active');

  // Admin cannot suspend themselves (self-protection)
  const selfSuspend = await req(`/admin/users/${adminUser._id}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ action: 'suspend', reason: 'Mistake' })
  });
  assert(selfSuspend.status === 400, 'Admin cannot suspend their own account (prevents accidental lockout)');

  // Admin role change workflow
  const roleChange = await req(`/admin/users/${sellerUser._id}/role`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ role: 'admin' })
  });
  assert(roleChange.ok && roleChange.data?.user?.role === 'admin', 'Admin successfully updates user role');

  // Change back to student
  const demoteBack = await req(`/admin/users/${sellerUser._id}/role`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ role: 'student' })
  });
  assert(demoteBack.ok && demoteBack.data?.user?.role === 'student', 'Admin successfully reverts user role to student');

  // 7. Test Listing Moderation
  console.log('\n7. Testing Admin Listing Management & Moderation...');
  const adminListings = await req('/admin/listings?page=1&limit=10', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(adminListings.ok && adminListings.data?.listings?.length >= 2, 'Admin retrieves listing management table');

  // Moderate (hide) a listing
  const hideRes = await req(`/admin/listings/${sellerListingId}/moderate`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ action: 'hide', reason: 'Inappropriate title' })
  });
  assert(hideRes.ok && hideRes.data?.listing?.isModerated === true, 'Admin successfully moderates/hides listing');

  // Moderated listing should not be returned in public feed
  const publicFeed = await req('/listings?limit=100');
  const foundInPublic = publicFeed.data?.listings?.some(l => l._id === sellerListingId);
  assert(!foundInPublic, 'Moderated listing is excluded from public browse feed');

  // Restore moderated listing
  const restoreRes = await req(`/admin/listings/${sellerListingId}/moderate`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ action: 'restore', reason: 'Approved on review' })
  });
  assert(restoreRes.ok && restoreRes.data?.listing?.isModerated === false, 'Admin restores moderated listing');

  // 8. Test Reports & Moderation Workflow
  console.log('\n8. Testing User Reporting & Admin Moderation Workflow...');
  
  // User submits report
  const reportRes = await req('/reports', {
    method: 'POST',
    headers: { Authorization: `Bearer ${seller2Token}` },
    body: JSON.stringify({
      targetType: 'listing',
      targetId: sellerListingId,
      category: 'inappropriate_content',
      description: 'Suspected duplicate or counterfeit product description.'
    })
  });
  if (!reportRes.ok) console.log('reportRes failed:', reportRes);
  assert(reportRes.ok && reportRes.data?.report?.status === 'PENDING', 'User submits report on listing (status PENDING)');
  const reportId = reportRes.data?.report?._id;

  // Duplicate pending report by same user is prevented
  const dupReportRes = await req('/reports', {
    method: 'POST',
    headers: { Authorization: `Bearer ${seller2Token}` },
    body: JSON.stringify({
      targetType: 'listing',
      targetId: sellerListingId,
      category: 'inappropriate_content',
      description: 'Another duplicate attempt.'
    })
  });
  assert(dupReportRes.status === 400, 'Duplicate pending report on same target prevented');

  // Admin retrieves reports
  const adminReports = await req('/admin/reports?status=PENDING', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(adminReports.ok && adminReports.data?.reports?.some(r => r._id === reportId), 'Admin views pending report in moderation queue');

  // Admin reviews and resolves report with internal note
  const resolveReport = await req(`/admin/reports/${reportId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      status: 'RESOLVED',
      internalNote: 'Seller verified purchase receipt; item authentic.',
      actionTaken: 'Verified authenticity with seller'
    })
  });
  assert(resolveReport.ok && resolveReport.data?.report?.status === 'RESOLVED', 'Admin updates report to RESOLVED with internal notes');

  // 9. Test Admin Analytics
  console.log('\n9. Testing Admin Platform Analytics...');
  const adminAnalytics = await req('/admin/analytics?range=30d', {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(adminAnalytics.ok, 'Admin retrieves comprehensive platform analytics');
  const stats = adminAnalytics.data?.metrics;
  assert(stats !== undefined, 'Analytics metrics object present');
  assert(typeof stats?.auctionCompletionRate === 'number', `Auction completion rate is safe number: ${stats?.auctionCompletionRate}%`);
  assert(typeof stats?.cancellationRate === 'number', `Cancellation rate is safe number: ${stats?.cancellationRate}%`);
  assert(Array.isArray(adminAnalytics.data?.categoryPopularity), 'Category popularity metrics returned');
  assert(adminAnalytics.data?.reportStatusMap !== undefined, 'Reports breakdown map returned');

  console.log('\n========================================');
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
