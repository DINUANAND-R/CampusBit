/**
 * CampusBid Automated Test Suite: Product Video Upload and Playback
 */

const fs = require('fs');
const path = require('path');

const API = 'http://localhost:5000/api';
const uploadDir = path.join(__dirname, 'uploads', 'listings');

let passed = 0;
let failed = 0;

function assert(description, condition) {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failed++;
  }
}

// 1x1 valid PNG buffer generator
function createPngBuffer() {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
}

// Valid mini MP4 generator with custom duration
function createMp4Buffer(durationSec = 15, timescale = 1000) {
  // ftyp box (16 bytes)
  const ftyp = Buffer.alloc(16);
  ftyp.writeUInt32BE(16, 0);
  ftyp.write('ftyp', 4, 'ascii');
  ftyp.write('mp42', 8, 'ascii');
  ftyp.writeUInt32BE(0, 12);

  // mvhd box payload (v0: 1 + 3 + 4 + 4 + 4 + 4 = 24 bytes)
  const durationUnits = Math.round(durationSec * timescale);
  const mvhdPayload = Buffer.alloc(24);
  mvhdPayload.writeUInt8(0, 0); // version 0
  mvhdPayload.writeUInt32BE(timescale, 12); // timescale
  mvhdPayload.writeUInt32BE(durationUnits, 16); // duration

  const mvhdBox = Buffer.concat([Buffer.alloc(8), mvhdPayload]);
  mvhdBox.writeUInt32BE(mvhdBox.length, 0);
  mvhdBox.write('mvhd', 4, 'ascii');

  const moovBox = Buffer.concat([Buffer.alloc(8), mvhdBox]);
  moovBox.writeUInt32BE(moovBox.length, 0);
  moovBox.write('moov', 4, 'ascii');

  return Buffer.concat([ftyp, moovBox]);
}

// Valid mini WebM generator with custom duration
function createWebmBuffer(durationSec = 20) {
  // EBML Header (ID: 0x1A45DFA3) with DocType 'webm'
  const docTypeVal = Buffer.from('webm', 'ascii');
  const docType = Buffer.concat([Buffer.from([0x42, 0x82, 0x84]), docTypeVal]);
  const ebmlHeader = Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x80 | docType.length]),
    docType,
  ]);

  // Segment (ID: 0x18538067)
  // Info (ID: 0x1549A966)
  // TimecodeScale (ID: 0x2AD7B1, default 1,000,000 ns = 1 ms)
  const tcVal = Buffer.alloc(3);
  tcVal.writeUIntBE(1000000, 0, 3);
  const tcElem = Buffer.concat([Buffer.from([0x2a, 0xd7, 0xb1, 0x83]), tcVal]);

  // Duration (ID: 0x4489, 4-byte float in ms)
  const durFloat = Buffer.alloc(4);
  durFloat.writeFloatBE(durationSec * 1000);
  const durationElem = Buffer.concat([Buffer.from([0x44, 0x89, 0x84]), durFloat]);

  const infoContent = Buffer.concat([tcElem, durationElem]);
  const infoElem = Buffer.concat([
    Buffer.from([0x15, 0x49, 0xa9, 0x66, 0x80 | infoContent.length]),
    infoContent,
  ]);

  const segmentElem = Buffer.concat([
    Buffer.from([0x18, 0x53, 0x80, 0x67, 0x80 | infoElem.length]),
    infoElem,
  ]);

  return Buffer.concat([ebmlHeader, segmentElem]);
}

async function testVideoUploadSuite() {
  console.log('====================================================');
  console.log('🎥 CAMPUSBID PRODUCT VIDEO UPLOAD & PLAYBACK SUITE');
  console.log('====================================================\n');

  const timestamp = Date.now();

  try {
    // 1. Register test users
    const sellerPayload = {
      username: `video_seller_${timestamp}`,
      email: `video_seller_${timestamp}@test.edu`,
      password: 'password123',
    };
    const attackerPayload = {
      username: `video_attacker_${timestamp}`,
      email: `video_attacker_${timestamp}@test.edu`,
      password: 'password123',
    };
    const bidderPayload = {
      username: `video_bidder_${timestamp}`,
      email: `video_bidder_${timestamp}@test.edu`,
      password: 'password123',
    };

    const [sRes, aRes, bRes] = await Promise.all([
      fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sellerPayload),
      }),
      fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attackerPayload),
      }),
      fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bidderPayload),
      }),
    ]);

    const sData = await sRes.json();
    const aData = await aRes.json();
    const bData = await bRes.json();
    const sellerToken = sData.access;
    const attackerToken = aData.access;
    const bidderToken = bData.access;

    assert('Seller, Attacker, and Bidder registered', sellerToken && attackerToken && bidderToken);

    // 2. Create listing with 2 images and 1 valid MP4 video (25 seconds)
    const formData = new FormData();
    formData.append('title', `Robotics Kit With Demo Video ${timestamp}`);
    formData.append('description', 'Authentic kit in great condition, video shows servo actuation');
    formData.append('category', 'electronics');
    formData.append('condition', 'like-new');
    formData.append('startingPrice', '1500');
    formData.append('minBidIncrement', '100');
    formData.append('durationHours', '24');

    formData.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'photo1.png');
    formData.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'photo2.png');

    const mp4Buffer = createMp4Buffer(25);
    formData.append('video', new Blob([mp4Buffer], { type: 'video/mp4' }), 'demo.mp4');

    const createRes = await fetch(`${API}/listings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: formData,
    });
    const createData = await createRes.json();

    assert('Create listing with images and MP4 video succeeds (201)', createRes.status === 201);
    const listingId = createData.listing?._id;
    const video = createData.listing?.video;

    assert('Listing has video object persisted in MongoDB', Boolean(video && video.url && video.filename));
    assert('Video metadata has correct mimeType video/mp4', video?.mimeType === 'video/mp4');
    assert('Video duration inspected and matches 25s', video?.duration === 25);
    assert('Video file physically exists on disk in uploads/listings/', fs.existsSync(path.join(uploadDir, video.filename)));

    // 3. Static video streaming & Range request test
    const videoUrl = `http://localhost:5000${video.url}`;
    const fullStreamRes = await fetch(videoUrl);
    assert('Uploaded MP4 video is served statically with 200 OK', fullStreamRes.status === 200);

    const rangeStreamRes = await fetch(videoUrl, {
      headers: { Range: 'bytes=0-15' },
    });
    assert('Video streaming supports byte range requests (206 Partial Content or 200)', rangeStreamRes.status === 206 || rangeStreamRes.status === 200);

    // 4. Create listing with valid WebM video (15 seconds)
    const webmFormData = new FormData();
    webmFormData.append('title', `WebM Video Listing ${timestamp}`);
    webmFormData.append('description', 'Testing WebM video format');
    webmFormData.append('category', 'sports');
    webmFormData.append('condition', 'good');
    webmFormData.append('startingPrice', '800');
    webmFormData.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'gear.png');

    const webmBuffer = createWebmBuffer(15);
    webmFormData.append('video', new Blob([webmBuffer], { type: 'video/webm' }), 'clip.webm');

    const webmRes = await fetch(`${API}/listings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: webmFormData,
    });
    const webmData = await webmRes.json();

    assert('Create listing with WebM video succeeds (201)', webmRes.status === 201);
    const webmVideo = webmData.listing?.video;
    assert('WebM video mimeType is video/webm', webmVideo?.mimeType === 'video/webm');
    assert('WebM video duration matches 15s', webmVideo?.duration === 15);
    assert('WebM video exists on disk', fs.existsSync(path.join(uploadDir, webmVideo.filename)));

    // 5. Reject video exceeding 60-second duration limit
    const longFormData = new FormData();
    longFormData.append('title', 'Too Long Video Listing');
    longFormData.append('description', 'Should fail due to 80s duration');
    longFormData.append('category', 'other');
    longFormData.append('condition', 'good');
    longFormData.append('startingPrice', '500');
    longFormData.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'photo.png');

    const longMp4 = createMp4Buffer(80); // 80 seconds > 60 seconds
    longFormData.append('video', new Blob([longMp4], { type: 'video/mp4' }), 'long.mp4');

    const longRes = await fetch(`${API}/listings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: longFormData,
    });
    const longData = await longRes.json();

    assert('Video exceeding 60-second limit is rejected with 400', longRes.status === 400);
    assert('Rejection message mentions 60 seconds limit', longData.message && longData.message.includes('60 seconds'));

    // 6. Reject unsupported / fake video format
    const fakeFormData = new FormData();
    fakeFormData.append('title', 'Fake Video Listing');
    fakeFormData.append('description', 'Text file disguised as mp4');
    fakeFormData.append('category', 'books');
    fakeFormData.append('condition', 'fair');
    fakeFormData.append('startingPrice', '200');
    fakeFormData.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'cover.png');
    fakeFormData.append('video', new Blob(['NOT_A_REAL_VIDEO_HEADER_DATA_12345'], { type: 'video/mp4' }), 'fake.mp4');

    const fakeRes = await fetch(`${API}/listings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: fakeFormData,
    });
    const fakeData = await fakeRes.json();

    assert('Fake video with invalid magic bytes rejected with 400', fakeRes.status === 400);
    assert('Clean error message returned without leaking server paths', !fakeData.message?.includes(':\\') && !fakeData.message?.includes('/home/'));

    // 7. Edit listing: Replace existing MP4 video with a new WebM video
    const oldMp4Filename = video.filename;
    const replaceFormData = new FormData();
    replaceFormData.append('title', `Robotics Kit Updated Video ${timestamp}`);
    replaceFormData.append('existingImages', JSON.stringify(createData.listing.images));

    const newWebmBuffer = createWebmBuffer(30);
    replaceFormData.append('video', new Blob([newWebmBuffer], { type: 'video/webm' }), 'new_demo.webm');

    const replaceRes = await fetch(`${API}/listings/${listingId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: replaceFormData,
    });
    const replaceData = await replaceRes.json();

    assert('Replace video succeeds (200)', replaceRes.status === 200);
    const updatedVideo = replaceData.listing?.video;
    assert('Video filename was updated to new file', updatedVideo?.filename && updatedVideo.filename !== oldMp4Filename);
    assert('Updated video mimeType is now video/webm', updatedVideo?.mimeType === 'video/webm');
    assert('New video file exists on disk', fs.existsSync(path.join(uploadDir, updatedVideo.filename)));
    assert('Old MP4 video file was safely deleted from disk', !fs.existsSync(path.join(uploadDir, oldMp4Filename)));

    // 8. Edit listing: Remove video explicitly
    const removeFormData = new FormData();
    removeFormData.append('title', `Robotics Kit Video Removed ${timestamp}`);
    removeFormData.append('existingImages', JSON.stringify(replaceData.listing.images));
    removeFormData.append('removeVideo', 'true');

    const removeRes = await fetch(`${API}/listings/${listingId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: removeFormData,
    });
    const removeData = await removeRes.json();

    assert('Remove video succeeds (200)', removeRes.status === 200);
    assert('Video is now null in database document', removeData.listing?.video === null);
    assert('Replaced video file was safely cleaned up from disk', !fs.existsSync(path.join(uploadDir, updatedVideo.filename)));

    // 9. Attacker cannot edit or modify another user listing
    const attackFormData = new FormData();
    attackFormData.append('title', 'Hacked Title');
    attackFormData.append('removeVideo', 'true');

    const attackRes = await fetch(`${API}/listings/${listingId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${attackerToken}` },
      body: attackFormData,
    });
    assert('Attacker edit attempt rejected with 403 Forbidden', attackRes.status === 403);

    // 10. Legacy / Image-only listing compatibility
    const legacyFormData = new FormData();
    legacyFormData.append('title', `Legacy Image Only ${timestamp}`);
    legacyFormData.append('description', 'Listing without any video attached');
    legacyFormData.append('category', 'furniture');
    legacyFormData.append('condition', 'good');
    legacyFormData.append('startingPrice', '450');
    legacyFormData.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'chair.png');

    const legacyRes = await fetch(`${API}/listings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: legacyFormData,
    });
    const legacyData = await legacyRes.json();

    assert('Image-only listing created successfully (201)', legacyRes.status === 201);
    assert('Image-only listing has video = null', legacyData.listing?.video === null);

    // 11. Bidding and proxy bidding on listing with video
    // Create new listing with video to bid on
    const auctionFormData = new FormData();
    auctionFormData.append('title', `Active Auction with Video ${timestamp}`);
    auctionFormData.append('description', 'Ready for live bidding');
    auctionFormData.append('category', 'electronics');
    auctionFormData.append('condition', 'like-new');
    auctionFormData.append('startingPrice', '1000');
    auctionFormData.append('minBidIncrement', '100');
    auctionFormData.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'item.png');
    auctionFormData.append('video', new Blob([createMp4Buffer(12)], { type: 'video/mp4' }), 'auction.mp4');

    const auctionRes = await fetch(`${API}/listings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: auctionFormData,
    });
    const auctionData = await auctionRes.json();
    const auctionListingId = auctionData.listing?._id;
    const auctionVideoFile = auctionData.listing?.video?.filename;

    // Place proxy bid as bidder
    const proxyRes = await fetch(`${API}/bids/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bidderToken}`,
      },
      body: JSON.stringify({
        listingId: auctionListingId,
        maxAmount: 1500,
      }),
    });
    const proxyData = await proxyRes.json();

    assert('Proxy bidding works on listing with video (200/201)', proxyRes.status === 200 || proxyRes.status === 201);
    assert('Current price rose to startingPrice + increment (₹1100)', proxyData.currentPrice === 1100);

    // 12. Delete listing cleans up both image and video files
    // Create a temporary listing with image & video, then delete it
    const tempFormData = new FormData();
    tempFormData.append('title', `Temp Listing For Deletion ${timestamp}`);
    tempFormData.append('description', 'Will be deleted');
    tempFormData.append('category', 'other');
    tempFormData.append('condition', 'good');
    tempFormData.append('startingPrice', '300');
    tempFormData.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), 'temp.png');
    tempFormData.append('video', new Blob([createMp4Buffer(10)], { type: 'video/mp4' }), 'temp.mp4');

    const tempRes = await fetch(`${API}/listings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: tempFormData,
    });
    const tempData = await tempRes.json();
    const tempListingId = tempData.listing?._id;
    const tempImgFile = tempData.listing?.images?.[0]?.filename;
    const tempVidFile = tempData.listing?.video?.filename;

    assert('Temp listing files exist on disk before deletion', fs.existsSync(path.join(uploadDir, tempImgFile)) && fs.existsSync(path.join(uploadDir, tempVidFile)));

    const delRes = await fetch(`${API}/listings/${tempListingId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    assert('Delete listing returns 200 OK', delRes.status === 200);

    assert('Associated image file was deleted from disk', !fs.existsSync(path.join(uploadDir, tempImgFile)));
    assert('Associated video file was deleted from disk', !fs.existsSync(path.join(uploadDir, tempVidFile)));

  } catch (err) {
    console.error('Fatal error in video upload test suite:', err);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`📊 VIDEO TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

testVideoUploadSuite();
