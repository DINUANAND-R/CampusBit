/**
 * Comprehensive Automated Test Suite for:
 * 1. Auction-Specific Discussion Box (Buyer-Seller Private Threads)
 * 2. Global Campus Marketplace Messaging (Direct Student Chat)
 * 3. Looking-for-Item Marketplace Requests
 * 4. Attachment Security & Validation
 * 5. Socket.IO Real-time Rooms & Privacy Isolation
 */

const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000/api';
const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:5000';

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
  console.log('\n========================================================');
  console.log('🧪 CampusBid: Auction Discussion & Campus Chat Tests');
  console.log('========================================================\n');

  const ts = Date.now();
  const sellerCreds = {
    username: `chat_seller_${ts}`,
    email: `seller_${ts}@test.campus.edu`,
    password: 'Password123!',
    campusId: `CS${ts.toString().slice(-5)}`
  };
  const buyer1Creds = {
    username: `chat_buyer1_${ts}`,
    email: `buyer1_${ts}@test.campus.edu`,
    password: 'Password123!',
    campusId: `CB1${ts.toString().slice(-5)}`
  };
  const buyer2Creds = {
    username: `chat_buyer2_${ts}`,
    email: `buyer2_${ts}@test.campus.edu`,
    password: 'Password123!',
    campusId: `CB2${ts.toString().slice(-5)}`
  };

  // 1. Setup Test Users
  console.log('1. Registering Test Users...');
  const regSeller = await req('/auth/register', { method: 'POST', body: JSON.stringify(sellerCreds) });
  assert(regSeller.ok && regSeller.data?.access, 'Registered Seller');
  const sellerToken = regSeller.data.access;
  const sellerUser = regSeller.data.user;

  const regBuyer1 = await req('/auth/register', { method: 'POST', body: JSON.stringify(buyer1Creds) });
  assert(regBuyer1.ok && regBuyer1.data?.access, 'Registered Buyer 1');
  const buyer1Token = regBuyer1.data.access;
  const buyer1User = regBuyer1.data.user;

  const regBuyer2 = await req('/auth/register', { method: 'POST', body: JSON.stringify(buyer2Creds) });
  assert(regBuyer2.ok && regBuyer2.data?.access, 'Registered Buyer 2');
  const buyer2Token = regBuyer2.data.access;
  const buyer2User = regBuyer2.data.user;

  // 2. Create Listing for Auction Discussions
  console.log('\n2. Creating an Auction Listing for Discussions...');
  const form = new FormData();
  form.append('title', `Discussion Camera ${ts}`);
  form.append('description', 'DSLR camera in mint condition');
  form.append('category', 'electronics');
  form.append('condition', 'like-new');
  form.append('startingPrice', '1200');
  form.append('minBidIncrement', '50');
  form.append('durationHours', '24');
  form.append('publishType', 'now');
  form.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'camera.png');

  const listingRes = await req('/listings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sellerToken}` },
    body: form,
  });
  assert(listingRes.ok && listingRes.data?.listing?._id, 'Listing created successfully');
  const listingId = listingRes.data?.listing?._id;

  // 3. Test Auction Discussion Box (Buyer 1 & Buyer 2 Private Threads)
  console.log('\n3. Testing Auction Discussion Box & Conversation Isolation...');

  // Seller cannot start discussion with themselves
  const selfDiscuss = await req(`/listings/${listingId}/conversations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sellerToken}` },
  });
  assert(selfDiscuss.status === 400, 'Seller cannot start buyer discussion with themselves on own auction');

  // Buyer 1 initiates conversation with seller
  const b1ConvRes = await req(`/listings/${listingId}/conversations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyer1Token}` },
  });
  assert(b1ConvRes.ok && b1ConvRes.data?.conversation?._id, 'Buyer 1 starts private discussion with seller');
  const b1ConvId = b1ConvRes.data?.conversation?._id;

  // Buyer 2 initiates conversation with seller
  const b2ConvRes = await req(`/listings/${listingId}/conversations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyer2Token}` },
  });
  assert(b2ConvRes.ok && b2ConvRes.data?.conversation?._id, 'Buyer 2 starts private discussion with seller');
  const b2ConvId = b2ConvRes.data?.conversation?._id;

  assert(b1ConvId !== b2ConvId, 'Buyer 1 and Buyer 2 have separate, isolated conversations for same listing');

  // Buyer 1 sends question to seller
  const clientTempId1 = `temp_${Date.now()}`;
  const sendMsg1 = await req(`/conversations/${b1ConvId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyer1Token}` },
    body: JSON.stringify({
      content: 'Hello! Does this camera include the 18-55mm kit lens and charger?',
      clientTempId: clientTempId1,
    }),
  });
  assert(sendMsg1.ok && sendMsg1.data?.message?.content?.includes('kit lens'), 'Buyer 1 sends question to seller');

  // Test deduplication: resending with same clientTempId returns existing message
  const dupMsg1 = await req(`/conversations/${b1ConvId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyer1Token}` },
    body: JSON.stringify({
      content: 'Hello! Does this camera include the 18-55mm kit lens and charger?',
      clientTempId: clientTempId1,
    }),
  });
  assert(dupMsg1.ok && dupMsg1.data?.deduplicated === true, 'Network retry with same clientTempId returns existing message (deduplicated)');

  // Privacy Isolation Check: Buyer 2 tries to access Buyer 1's conversation
  const b2AccessB1 = await req(`/conversations/${b1ConvId}/messages`, {
    headers: { Authorization: `Bearer ${buyer2Token}` },
  });
  assert(b2AccessB1.status === 403, 'Buyer 2 is blocked from viewing Buyer 1 private conversation (403 Forbidden)');

  // Seller views all buyer inquiry conversations for this listing
  const sellerListingConvs = await req(`/listings/${listingId}/conversations`, {
    headers: { Authorization: `Bearer ${sellerToken}` },
  });
  assert(sellerListingConvs.ok && sellerListingConvs.data?.conversations?.length >= 2, 'Seller retrieves all buyer inquiry threads for their listing');

  // Seller replies to Buyer 1
  const sellerReply = await req(`/conversations/${b1ConvId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sellerToken}` },
    body: JSON.stringify({
      content: 'Yes, original battery, wall charger, and 18-55mm IS lens are all included!',
    }),
  });
  assert(sellerReply.ok && sellerReply.data?.message?.sender?._id === sellerUser._id, 'Seller successfully replies to Buyer 1');

  // Read receipts: Buyer 1 marks conversation as read
  const markRead = await req(`/conversations/${b1ConvId}/read`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${buyer1Token}` },
  });
  assert(markRead.ok && markRead.data?.success === true, 'Buyer 1 marks conversation messages as read');

  // Unread count check
  const unreadCount = await req('/conversations/unread/count', {
    headers: { Authorization: `Bearer ${buyer1Token}` },
  });
  assert(unreadCount.ok && typeof unreadCount.data?.unreadCount === 'number', 'Unread messages count query succeeds');

  // 4. Test Global Direct Messaging
  console.log('\n4. Testing Global Direct Student Chat...');

  // User cannot direct message themselves
  const selfDirect = await req('/conversations/direct', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyer1Token}` },
    body: JSON.stringify({ recipientId: buyer1User._id }),
  });
  assert(selfDirect.status === 400, 'Student cannot message themselves (400 rejected)');

  // Nonexistent recipient
  const nonExistent = await req('/conversations/direct', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyer1Token}` },
    body: JSON.stringify({ recipientId: '6ae183cef7b428927ab019e0' }),
  });
  assert(nonExistent.status === 404, 'Direct message to nonexistent student rejected (404)');

  // Buyer 1 starts direct message with Buyer 2
  const directRes = await req('/conversations/direct', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyer1Token}` },
    body: JSON.stringify({ recipientId: buyer2User._id }),
  });
  assert(directRes.ok && directRes.data?.conversation?._id, 'Direct conversation between students created');
  const directConvId = directRes.data?.conversation?._id;

  const directMsg = await req(`/conversations/${directConvId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyer1Token}` },
    body: JSON.stringify({ content: 'Hey, do you have any spare lecture notes for Physics 101?' }),
  });
  assert(directMsg.ok, 'Student sends direct message to peer');

  // 5. Test Looking-for-Item Posts ("Item Requests")
  console.log('\n5. Testing Looking-For-Item Marketplace Posts...');

  // Buyer 2 posts a request
  const itemReqRes = await req('/item-requests', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyer2Token}` },
    body: JSON.stringify({
      title: 'Looking for TI-84 Scientific Calculator',
      category: 'electronics',
      description: 'Need a working scientific calculator for upcoming exams.',
      budgetMin: 500,
      budgetMax: 1500,
    }),
  });
  assert(itemReqRes.ok && itemReqRes.data?.itemRequest?._id, 'Student posts Looking-for-item request');
  const requestId = itemReqRes.data?.itemRequest?._id;

  // Buyer 2 cannot message themselves about their own request
  const selfReqMsg = await req('/conversations/request', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyer2Token}` },
    body: JSON.stringify({ requestId }),
  });
  assert(selfReqMsg.status === 400, 'Student cannot message themselves regarding their own item request');

  // Buyer 1 messages Buyer 2 about their request
  const reqConvRes = await req('/conversations/request', {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyer1Token}` },
    body: JSON.stringify({ requestId }),
  });
  assert(reqConvRes.ok && reqConvRes.data?.conversation?._id, 'Peer starts conversation with requester regarding wanted item');
  const reqConvId = reqConvRes.data?.conversation?._id;

  const offerMsg = await req(`/conversations/${reqConvId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${buyer1Token}` },
    body: JSON.stringify({ content: 'I have a TI-84 in good condition with cover, selling for ₹1000.' }),
  });
  assert(offerMsg.ok, 'Peer offers item to requester via chat');

  // Requester marks request as FULFILLED
  const markFulfilled = await req(`/item-requests/${requestId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${buyer2Token}` },
    body: JSON.stringify({ status: 'FULFILLED' }),
  });
  assert(markFulfilled.ok && markFulfilled.data?.itemRequest?.status === 'FULFILLED', 'Requester marks item request as FULFILLED');

  // Non-owner cannot update request status
  const unauthStatus = await req(`/item-requests/${requestId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${buyer1Token}` },
    body: JSON.stringify({ status: 'CANCELLED' }),
  });
  assert(unauthStatus.status === 403, 'Non-owner cannot update item request status (403 Forbidden)');

  // 6. Test File Attachments & Security
  console.log('\n6. Testing File Attachments & Validation Security...');

  // Valid PNG attachment
  const attachForm = new FormData();
  attachForm.append('content', 'Here is a photo of the lens serial number.');
  attachForm.append('attachments', new Blob([createPngBuffer()], { type: 'image/png' }), 'lens.png');

  const attachRes = await req(`/conversations/${b1ConvId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sellerToken}` },
    body: attachForm,
  });
  assert(attachRes.ok && attachRes.data?.message?.attachments?.length === 1, 'Valid image attachment uploaded and attached to message');

  // Fake image rejected by magic-bytes
  const fakeForm = new FormData();
  fakeForm.append('content', 'Malicious file attempt');
  fakeForm.append('attachments', new Blob([Buffer.from('FAKE CONTENT NOT A REAL IMAGE OR PDF')], { type: 'image/png' }), 'fake.png');

  const fakeRes = await req(`/conversations/${b1ConvId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sellerToken}` },
    body: fakeForm,
  });
  assert(fakeRes.status === 400 && fakeRes.data?.message?.includes('security validation'), 'File with fake extension failing magic-bytes is rejected with 400');

  // 7. Test Socket.IO Real-Time Messaging & Room Isolation
  console.log('\n7. Testing Socket.IO Real-time Messaging & Room Isolation...');

  console.log('Connecting socketBuyer1 to', SOCKET_URL);
  const socketBuyer1 = io(SOCKET_URL, {
    transports: ['websocket'],
  });

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      console.log('socketBuyer1 timeout, connected is:', socketBuyer1.connected);
      resolve();
    }, 2000);
    socketBuyer1.on('connect', () => {
      clearTimeout(t);
      console.log('socketBuyer1 connected successfully, id:', socketBuyer1.id);
      resolve();
    });
    socketBuyer1.on('connect_error', (err) => {
      console.error('socketBuyer1 connect_error:', err.message);
    });
  });

  let socketReceivedMsg = null;
  socketBuyer1.on('message:new', ({ message, conversationId }) => {
    if (conversationId === b1ConvId) {
      socketReceivedMsg = message;
    }
  });

  socketBuyer1.emit('conversation:join', { conversationId: b1ConvId, token: buyer1Token });
  await new Promise((r) => setTimeout(r, 400));

  // Seller sends message via HTTP, should broadcast over socket to conversation room
  await req(`/conversations/${b1ConvId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sellerToken}` },
    body: JSON.stringify({ content: 'Real-time test message over socket' }),
  });

  await new Promise((r) => setTimeout(r, 600));
  assert(
    socketReceivedMsg !== null && socketReceivedMsg.content === 'Real-time test message over socket',
    'Socket 1 received real-time message:new event in private conversation room'
  );
  socketBuyer1.disconnect();

  // Verify unauthorized user cannot join room
  const socketBuyer2 = io(SOCKET_URL, {
    transports: ['websocket'],
  });

  await new Promise((resolve) => {
    socketBuyer2.on('connect', () => {
      resolve();
    });
  });

  let socketError = null;
  socketBuyer2.on('conversation:error', ({ message }) => {
    socketError = message;
  });

  // Buyer 2 attempts to join Buyer 1's conversation room
  socketBuyer2.emit('conversation:join', { conversationId: b1ConvId, token: buyer2Token });
  await new Promise((r) => setTimeout(r, 800));

  assert(
    socketError !== null && (socketError.includes('Access denied') || socketError.includes('participant')),
    'Unauthorized socket join to private conversation room rejected with error'
  );
  socketBuyer2.disconnect();

  console.log('\n========================================================');
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
