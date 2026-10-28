const Listing = require('../models/Listing');
const Bid = require('../models/Bid');
const Handover = require('../models/Handover');
const { deleteUploadedFiles, deleteListingFile } = require('../middleware/uploadMiddleware');

// GET /api/listings
exports.getListings = async (req, res, next) => {
  try {
    const {
      q,
      category,
      status = 'active',
      sort = 'endsAt',
      page = 1,
      limit = 12,
    } = req.query;

    const filter = { status };
    if (q) filter.$text = { $search: q };
    if (category) filter.category = category;

    const sortMap = {
      endsAt: { endsAt: 1 },
      newest: { createdAt: -1 },
      price_asc: { currentPrice: 1 },
      price_desc: { currentPrice: -1 },
    };

    const listings = await Listing.find(filter)
      .sort(sortMap[sort] || sortMap.endsAt)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('seller', 'username avatarUrl')
      .lean();

    const total = await Listing.countDocuments(filter);

    res.json({ listings, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
};

// GET /api/listings/:id
exports.getListing = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id)
      .populate('seller', 'username avatarUrl campusId')
      .populate('winner', 'username')
      .populate('leadingBid');
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    res.json({ listing });
  } catch (err) {
    next(err);
  }
};

// POST /api/listings
exports.createListing = async (req, res, next) => {
  try {
    const {
      title,
      description,
      category,
      condition,
      startingPrice,
      reservePrice,
      minBidIncrement,
      durationHours,
    } = req.body;

    // 1. Process uploaded files from Multer
    const uploadedImages = (req.files || []).map((file) => ({
      url: `/uploads/listings/${file.filename}`,
      filename: file.filename,
    }));

    // 2. Process any JSON/string image URLs (e.g. from tests or external input)
    let bodyImages = [];
    if (req.body.images) {
      if (typeof req.body.images === 'string') {
        try {
          bodyImages = JSON.parse(req.body.images);
        } catch {
          bodyImages = [req.body.images];
        }
      } else if (Array.isArray(req.body.images)) {
        bodyImages = req.body.images;
      }
    }
    const normalizedBodyImages = bodyImages.map((img) =>
      typeof img === 'string' ? { url: img, filename: '' } : img
    );

    const allImages = [...uploadedImages, ...normalizedBodyImages];

    // 3. Validate image count
    if (allImages.length < 1) {
      await deleteUploadedFiles(req.files);
      return res.status(400).json({ message: 'At least one image is required (maximum 5)' });
    }
    if (allImages.length > 5) {
      await deleteUploadedFiles(req.files);
      return res.status(400).json({ message: 'Maximum 5 images allowed per listing' });
    }

    const parsedDuration = Number(durationHours) || 24;
    const endsAt = new Date(Date.now() + parsedDuration * 60 * 60 * 1000);

    const listing = await Listing.create({
      seller: req.user._id,
      title,
      description,
      category: category ? category.toLowerCase().trim() : 'other',
      condition: condition ? condition.toLowerCase().trim().replace(/\s+/g, '-') : 'good',
      images: allImages,
      startingPrice: Number(startingPrice),
      reservePrice: reservePrice ? Number(reservePrice) : null,
      minBidIncrement: minBidIncrement ? Number(minBidIncrement) : 10,
      endsAt,
    });

    res.status(201).json({ listing });
  } catch (err) {
    // Clean up newly uploaded files on failure
    await deleteUploadedFiles(req.files);
    next(err);
  }
};

// PATCH /api/listings/:id
exports.updateListing = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      await deleteUploadedFiles(req.files);
      return res.status(404).json({ message: 'Listing not found' });
    }

    // Permission check
    if (
      listing.seller.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      await deleteUploadedFiles(req.files);
      return res.status(403).json({ message: 'Not authorised' });
    }

    // Status check
    if (listing.status !== 'draft' && listing.status !== 'active') {
      await deleteUploadedFiles(req.files);
      return res.status(400).json({ message: 'Cannot edit a closed listing' });
    }

    // Bid check: only allow editing before any bids are placed
    const bidCount = await Bid.countDocuments({ listing: listing._id });
    if (bidCount > 0) {
      await deleteUploadedFiles(req.files);
      return res.status(400).json({ message: 'Cannot edit a listing that has bids' });
    }

    // Process retained existing images
    let retainedImages = listing.images;
    if (req.body.existingImages !== undefined) {
      let allowedExisting = [];
      if (typeof req.body.existingImages === 'string') {
        try {
          allowedExisting = JSON.parse(req.body.existingImages);
        } catch {
          allowedExisting = [req.body.existingImages];
        }
      } else if (Array.isArray(req.body.existingImages)) {
        allowedExisting = req.body.existingImages;
      }

      // Map allowed existing items to identifier strings (filename or url)
      const allowedIdentifiers = new Set(
        allowedExisting.map((item) =>
          typeof item === 'object' && item !== null ? (item.filename || item.url) : String(item)
        )
      );

      // Filter existing images against allowed identifiers (resolves strictly against existing DB record)
      retainedImages = listing.images.filter((img) =>
        allowedIdentifiers.has(img.filename) || allowedIdentifiers.has(img.url)
      );
    }

    // Process newly uploaded files
    const newImages = (req.files || []).map((file) => ({
      url: `/uploads/listings/${file.filename}`,
      filename: file.filename,
    }));

    const finalImages = [...retainedImages, ...newImages];

    if (finalImages.length < 1) {
      await deleteUploadedFiles(req.files);
      return res.status(400).json({ message: 'A listing must have at least one image' });
    }
    if (finalImages.length > 5) {
      await deleteUploadedFiles(req.files);
      return res.status(400).json({ message: 'Maximum 5 images allowed per listing' });
    }

    // Determine removed files to delete from disk after DB update succeeds
    const removedImages = listing.images.filter(
      (orig) => !finalImages.some((f) => (f.filename && f.filename === orig.filename) || f.url === orig.url)
    );

    // Update fields
    const allowed = ['title', 'description', 'category', 'condition', 'reservePrice', 'minBidIncrement'];
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) {
        if (k === 'category') listing[k] = req.body[k].toLowerCase().trim();
        else if (k === 'condition') listing[k] = req.body[k].toLowerCase().trim().replace(/\s+/g, '-');
        else listing[k] = req.body[k];
      }
    });

    listing.images = finalImages;
    await listing.save();

    // Delete removed files from disk only after successful DB update
    for (const removed of removedImages) {
      if (removed.filename) {
        await deleteListingFile(removed.filename);
      }
    }

    res.json({ listing });
  } catch (err) {
    // Clean up newly uploaded files on failure
    await deleteUploadedFiles(req.files);
    next(err);
  }
};

// DELETE /api/listings/:id
exports.deleteListing = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    if (
      listing.seller.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ message: 'Not authorised' });
    }
    const bidCount = await Bid.countDocuments({ listing: listing._id });
    if (bidCount > 0) {
      return res.status(400).json({ message: 'Cannot delete a listing with bids' });
    }

    // Remove associated image files from disk
    if (listing.images && Array.isArray(listing.images)) {
      for (const img of listing.images) {
        if (img.filename) {
          await deleteListingFile(img.filename);
        }
      }
    }

    await listing.deleteOne();
    res.json({ message: 'Listing deleted' });
  } catch (err) {
    next(err);
  }
};

// GET /api/listings/my  — seller's own listings
exports.myListings = async (req, res, next) => {
  try {
    const listings = await Listing.find({ seller: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ listings });
  } catch (err) {
    next(err);
  }
};
