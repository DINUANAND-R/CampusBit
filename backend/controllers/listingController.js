const Listing = require('../models/Listing');
const Bid = require('../models/Bid');
const Handover = require('../models/Handover');

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
      images,
      startingPrice,
      reservePrice,
      minBidIncrement,
      durationHours,
    } = req.body;

    const endsAt = new Date(Date.now() + (durationHours || 24) * 60 * 60 * 1000);

    const listing = await Listing.create({
      seller: req.user._id,
      title,
      description,
      category: category ? category.toLowerCase().trim() : 'other',
      condition: condition ? condition.toLowerCase().trim().replace(/\s+/g, '-') : 'good',
      images: images || [],
      startingPrice: Number(startingPrice),
      reservePrice: reservePrice ? Number(reservePrice) : null,
      minBidIncrement: minBidIncrement ? Number(minBidIncrement) : 10,
      endsAt,
    });

    res.status(201).json({ listing });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/listings/:id
exports.updateListing = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    if (
      listing.seller.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ message: 'Not authorised' });
    }
    if (listing.status !== 'draft' && listing.status !== 'active') {
      return res.status(400).json({ message: 'Cannot edit a closed listing' });
    }
    // Only allow editing before any bids are placed
    const bidCount = await Bid.countDocuments({ listing: listing._id });
    if (bidCount > 0) {
      return res.status(400).json({ message: 'Cannot edit a listing that has bids' });
    }

    const allowed = ['title', 'description', 'category', 'condition', 'images', 'reservePrice'];
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) listing[k] = req.body[k];
    });
    await listing.save();
    res.json({ listing });
  } catch (err) {
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
