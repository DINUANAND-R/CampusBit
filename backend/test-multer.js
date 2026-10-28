const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const API = 'http://localhost:5000/api';
const uploadDir = path.join(__dirname, 'uploads', 'listings');

// Generate a valid minimal 1x1 PNG buffer
const createPngBuffer = () => {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk length & type
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // bit depth, color type, compression, filter, interlace
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // CRC, IDAT chunk
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, // image data
    0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, // CRC
    0xb0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND chunk
    0x44, 0xae, 0x42, 0x60, 0x82                    // CRC
  ]);
};

// Generate an invalid file disguised as an image
const createFakeImageBuffer = () => {
  return Buffer.from('THIS IS NOT A VALID IMAGE BUFFER AT ALL');
};

// Generate an oversized buffer (> 5 MB)
const createOversizedPngBuffer = () => {
  const base = createPngBuffer();
  const oversized = Buffer.alloc(5.2 * 1024 * 1024);
  base.copy(oversized, 0);
  return oversized;
};

async function testMulterSuite() {
  console.log('====================================================');
  console.log('📸 MULTER MULTI-IMAGE UPLOAD & VERIFICATION SUITE');
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
    const timestamp = Date.now();

    // 1. Register Seller and Attacker
    const sellerPayload = {
      username: `multer_seller_${timestamp}`,
      email: `seller_${timestamp}@test.edu`,
      password: 'password123',
    };
    const attackerPayload = {
      username: `attacker_${timestamp}`,
      email: `attacker_${timestamp}@test.edu`,
      password: 'password123',
    };

    const sRes = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sellerPayload),
    });
    const sData = await sRes.json();
    const sellerToken = sData.access;

    const aRes = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attackerPayload),
    });
    const aData = await aRes.json();
    const attackerToken = aData.access;

    assert('Seller and Attacker registered', sellerToken && attackerToken);

    // 2. Create listing with 3 valid PNG images using FormData
    const formData = new FormData();
    formData.append('title', `Calculus Textbook ${timestamp}`);
    formData.append('description', 'Clean textbook with 3 real device photos');
    formData.append('category', 'books');
    formData.append('condition', 'like-new');
    formData.append('startingPrice', '250');
    formData.append('minBidIncrement', '15');
    formData.append('durationHours', '24');

    const pngBlob1 = new Blob([createPngBuffer()], { type: 'image/png' });
    const pngBlob2 = new Blob([createPngBuffer()], { type: 'image/png' });
    const pngBlob3 = new Blob([createPngBuffer()], { type: 'image/png' });

    formData.append('images', pngBlob1, 'cover.png');
    formData.append('images', pngBlob2, 'page1.png');
    formData.append('images', pngBlob3, 'back.png');

    const createRes = await fetch(`${API}/listings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: formData,
    });
    const createData = await createRes.json();
    assert('Create listing with 3 images succeeds (201)', createRes.status === 201);
    const listingId = createData.listing?._id;
    const images = createData.listing?.images || [];
    assert('Listing has 3 images stored in MongoDB', images.length === 3);

    // 3. Verify files exist on disk in uploads/listings
    let allFilesExist = true;
    for (const img of images) {
      assert('Image record contains url and filename', img.url && img.filename);
      const filePath = path.join(uploadDir, img.filename);
      if (!fs.existsSync(filePath)) {
        allFilesExist = false;
      }
    }
    assert('All 3 uploaded files physically exist on disk in uploads/listings/', allFilesExist);

    // 4. Verify static file serving via GET request
    const firstImageUrl = `http://localhost:5000${images[0].url}`;
    const staticRes = await fetch(firstImageUrl);
    assert('Uploaded image is served statically with 200 OK', staticRes.status === 200);

    // 5. Edit listing: Add a 4th image, remove the 1st image
    const editFormData = new FormData();
    editFormData.append('title', `Calculus Textbook Updated ${timestamp}`);
    editFormData.append('description', 'Updated description after removing cover and adding new pic');
    editFormData.append('category', 'books');
    editFormData.append('condition', 'like-new');

    // Retain only images[1] and images[2]
    const retained = [images[1], images[2]];
    const removedFilename = images[0].filename;
    editFormData.append('existingImages', JSON.stringify(retained));

    // Add 4th image
    const pngBlob4 = new Blob([createPngBuffer()], { type: 'image/png' });
    editFormData.append('images', pngBlob4, 'new_cover.png');

    const updateRes = await fetch(`${API}/listings/${listingId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: editFormData,
    });
    const updateData = await updateRes.json();
    assert('Edit listing with added/retained images succeeds (200)', updateRes.status === 200);

    const updatedImages = updateData.listing?.images || [];
    assert('Listing now has 3 images (2 retained + 1 new)', updatedImages.length === 3);

    // Verify removed file was deleted from disk
    const removedFilePath = path.join(uploadDir, removedFilename);
    assert('Removed file was deleted from disk after successful update', !fs.existsSync(removedFilePath));

    // Verify newly added file exists on disk
    const addedImage = updatedImages.find((img) => img.filename !== images[1].filename && img.filename !== images[2].filename);
    assert('Newly added image file exists on disk', addedImage && fs.existsSync(path.join(uploadDir, addedImage.filename)));

    // 6. Security: Unauthorized user cannot edit another seller's listing
    const badEditFormData = new FormData();
    badEditFormData.append('title', 'Hacked Title');
    const attackRes = await fetch(`${API}/listings/${listingId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${attackerToken}` },
      body: badEditFormData,
    });
    assert('Unauthorized user cannot edit another seller listing (403)', attackRes.status === 403);

    // 7. Security: Magic bytes validation — reject fake image
    const initialFileCount = fs.readdirSync(uploadDir).length;

    const fakeFormData = new FormData();
    fakeFormData.append('title', 'Fake Image Listing');
    fakeFormData.append('description', 'Should be rejected due to bad magic bytes');
    fakeFormData.append('category', 'other');
    fakeFormData.append('condition', 'good');
    fakeFormData.append('startingPrice', '100');
    const fakeBlob = new Blob([createFakeImageBuffer()], { type: 'image/png' });
    fakeFormData.append('images', fakeBlob, 'malicious.png');

    const fakeRes = await fetch(`${API}/listings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: fakeFormData,
    });
    assert('Fake image rejected by magic-bytes validation (400)', fakeRes.status === 400);

    // Verify no orphaned files left after failed magic bytes check
    const afterFakeFileCount = fs.readdirSync(uploadDir).length;
    assert('No orphaned files left on disk after magic-bytes rejection', initialFileCount === afterFakeFileCount);

    // 8. Security: Oversized file (> 5 MB) rejection
    const oversizeFormData = new FormData();
    oversizeFormData.append('title', 'Oversized Image Listing');
    oversizeFormData.append('description', 'Should be rejected due to size > 5MB');
    oversizeFormData.append('category', 'other');
    oversizeFormData.append('condition', 'good');
    oversizeFormData.append('startingPrice', '100');
    const oversizeBlob = new Blob([createOversizedPngBuffer()], { type: 'image/png' });
    oversizeFormData.append('images', oversizeBlob, 'huge.png');

    const oversizeRes = await fetch(`${API}/listings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: oversizeFormData,
    });
    assert('Oversized image rejected with 400', oversizeRes.status === 400);

    // 9. Security: Excessive files (> 5 images) rejection
    const excessFormData = new FormData();
    excessFormData.append('title', 'Excessive Images Listing');
    excessFormData.append('description', 'Trying to upload 6 images');
    excessFormData.append('category', 'other');
    excessFormData.append('condition', 'good');
    excessFormData.append('startingPrice', '100');
    for (let i = 0; i < 6; i++) {
      excessFormData.append('images', new Blob([createPngBuffer()], { type: 'image/png' }), `img_${i}.png`);
    }

    const excessRes = await fetch(`${API}/listings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: excessFormData,
    });
    assert('Excessive image count (> 5) rejected with 400', excessRes.status === 400);

    // 10. Delete listing cleans up files on disk
    const delRes = await fetch(`${API}/listings/${listingId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    assert('Delete listing succeeds (200)', delRes.status === 200);

    let allDeleted = true;
    for (const img of updatedImages) {
      if (fs.existsSync(path.join(uploadDir, img.filename))) {
        allDeleted = false;
      }
    }
    assert('All associated image files deleted from disk when listing is deleted', allDeleted);

  } catch (err) {
    console.error('Fatal test error in testMulterSuite:', err);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`📊 MULTER TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

testMulterSuite();
