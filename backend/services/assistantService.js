/**
 * CampusBid Rule-Based AI Shopping Assistant Service (Zero External APIs / No LLM)
 *
 * Implements deterministic natural-language parsing, regex budget extraction,
 * category synonym resolution, condition detection, safe MongoDB queries,
 * and structured comparison generation.
 */

const Listing = require('../models/Listing');
const Bid = require('../models/Bid');

// ── Synonyms and Taxonomy Maps ────────────────────────────────────────────────
const CATEGORY_MAP = {
  sports: ['cycle', 'bicycle', 'bike', 'badminton', 'racket', 'cricket', 'football', 'gym', 'dumbbell', 'sports', 'skateboard'],
  electronics: ['laptop', 'notebook', 'macbook', 'pc', 'computer', 'phone', 'mobile', 'smartphone', 'iphone', 'android', 'calculator', 'scientific calculator', 'electronics', 'headphone', 'headphones', 'earphones', 'earbuds', 'airpods', 'charger', 'tablet', 'ipad', 'mouse', 'keyboard', 'monitor'],
  books: ['book', 'books', 'textbook', 'textbooks', 'novel', 'novels', 'notes', 'syllabus', 'guide', 'dictionary', 'handbook'],
  clothing: ['clothing', 'clothes', 'shirt', 't-shirt', 'tshirt', 'hoodie', 'jacket', 'jeans', 'pants', 'trousers', 'shoes', 'sneakers', 'jersey'],
  furniture: ['furniture', 'chair', 'table', 'desk', 'bed', 'mattress', 'shelf', 'bookshelf', 'lamp', 'stool', 'drawer'],
};

const CONDITION_MAP = {
  'new': [/\b(?:brand\s+)?new\b/i, /\bunopened\b/i, /\bsealed\b/i],
  'like-new': [/\blike[\s-]new\b/i, /\bmint\b/i, /\balmost\s+new\b/i, /\bflawless\b/i],
  'good': [/\bgood(?:\s+condition)?\b/i, /\bgently\s+used\b/i, /\bwell[\s-]kept\b/i],
  'fair': [/\bfair(?:\s+condition)?\b/i, /\bacceptable\b/i, /\bused\b/i, /\bworking\b/i],
};

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'for', 'to', 'from', 'by', 'with', 'about',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they',
  'find', 'search', 'show', 'get', 'look', 'looking', 'need', 'want', 'please',
  'under', 'below', 'less', 'than', 'within', 'max', 'maximum', 'up', 'budget',
  'between', 'and', 'or', 'of', 'active', 'auctions', 'auction', 'products', 'product',
  'items', 'item', 'listing', 'listings', 'cheap', 'cheapest', 'good', 'best',
  'rupees', 'rupee', 'rs', 'inr', 'price', 'pricing', 'cost', 'costs', 'help',
  'some', 'any', 'can', 'could', 'would', 'is', 'are', 'was', 'were', 'give',
  'stuff', 'something', 'things', 'thing', 'everything', 'anything', 'whatever',
  'all', 'goodies', 'equipment', 'device', 'devices', 'gadget', 'gadgets',
  'two', 'three', 'four', 'five', 'many', 'much', 'me', 'us'
]);

/**
 * Normalizes number string supporting "2k" -> 2000, "15 thousand" -> 15000, "₹2,000" -> 2000.
 */
function parseRawAmount(str) {
  if (!str) return null;
  const clean = str.replace(/[₹,\s]/g, '').toLowerCase();

  // Match: 2.5k, 2k, 15k
  const kMatch = clean.match(/^([0-9]+(?:\.[0-9]+)?)k$/);
  if (kMatch) {
    const val = parseFloat(kMatch[1]) * 1000;
    return isNaN(val) ? null : Math.round(val);
  }

  // Match: 2 thousand, 2.5 thousand
  const thousandMatch = clean.match(/^([0-9]+(?:\.[0-9]+)?)thousand/);
  if (thousandMatch) {
    const val = parseFloat(thousandMatch[1]) * 1000;
    return isNaN(val) ? null : Math.round(val);
  }

  const num = parseFloat(clean);
  return isNaN(num) ? null : Math.round(num);
}

/**
 * Escapes characters for safe MongoDB Regex to prevent ReDoS & injection.
 */
function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Parses user input to extract intent, budget, price range, category, condition, and keywords.
 */
function parseMessage(text) {
  if (typeof text !== 'string') {
    text = '';
  }
  const raw = text.trim();
  const lower = raw.toLowerCase();

  // 1. Detect greetings and general help
  if (/^(hi|hello|hey|greetings|hola|namaste|help me|what can you do|who are you)\b/i.test(lower) && lower.split(/\s+/).length <= 4) {
    return {
      intent: 'GREETING',
      raw,
      reply: "Hello! I'm CampusBid's rule-based shopping assistant. I can help you discover products within your budget, compare listings, check ending-soon auctions, and guide you through bidding.",
    };
  }

  // 2. Detect Bidding Guidance Intent
  if (/\b(?:help\s+me\s+bid|how\s+to\s+bid|how\s+do\s+i\s+bid|guide\s+to\s+bidding|bidding\s+help|proxy\s+bid(?:ding)?)\b/i.test(lower)) {
    return {
      intent: 'BID_HELP',
      raw,
      reply: "Here is how bidding works on CampusBid:\n1. Search or browse products to find an active auction.\n2. In this assistant, click 'Bid on this Item' on any product card, or view the listing details.\n3. Enter your maximum budget. Our automatic proxy bidding will place the lowest required bid and only increment if competing bids are placed.\n4. You must explicitly review and confirm the bid before anything is placed.",
    };
  }

  // 3. Detect Comparison Intent
  const isCompare = /\b(?:compare|comparison|versus|\bvs\b|difference\s+between|which\s+is\s+better)\b/i.test(lower);

  // 4. Detect Ending-Soon Intent
  const isEndingSoon = /\b(?:ending\s+soon|ending\s+today|closing\s+soon|closing\s+today|expiring\s+soon|last\s+chance|hurry)\b/i.test(lower);

  // 5. Extract Price Range ("between 200 and 500 rupees", "from ₹1,000 to ₹3,000", "2k to 5k")
  let minPrice = null;
  let maxPrice = null;

  const rangePattern = /(?:between|from)\s+([₹rsinr\s]*[0-9,]+(?:\.[0-9]+)?\s*(?:k|thousand)?)\s*(?:and|to|-)\s*([₹rsinr\s]*[0-9,]+(?:\.[0-9]+)?\s*(?:k|thousand)?(?:\s*(?:rupees?|rs\.?|inr))?)/i;
  const rangeMatch = lower.match(rangePattern);
  if (rangeMatch) {
    const p1 = parseRawAmount(rangeMatch[1]);
    const p2 = parseRawAmount(rangeMatch[2]);
    if (p1 !== null && p2 !== null) {
      minPrice = Math.min(p1, p2);
      maxPrice = Math.max(p1, p2);
    }
  }

  // 6. Extract Maximum Budget if range not matched
  // Phrases: "under 2000", "below ₹2,000", "less than 2k", "within 15 thousand", "up to 500", "max 3000", "budget of 1000"
  if (maxPrice === null) {
    const maxBudgetPattern = /(?:under|below|less\s+than|within|maximum|max|up\s+to|at\s+most|budget\s+of|budget\s*:?\s*|cheaper\s+than)\s+([₹rsinr\s]*[0-9,]+(?:\.[0-9]+)?\s*(?:k|thousand)?(?:\s*(?:rupees?|rs\.?|inr))?)/i;
    const maxMatch = lower.match(maxBudgetPattern);
    if (maxMatch) {
      maxPrice = parseRawAmount(maxMatch[1]);
    }
  }

  // Also check for standalone amount with currency if still null: "cycle for ₹2,000", "phone ₹15000", "laptop 15k"
  if (maxPrice === null && minPrice === null) {
    const currencyAmountPattern = /(?:for|around|approx(?:\.|imately)?|at)\s+([₹rsinr\s]*[0-9,]+(?:\.[0-9]+)?\s*(?:k|thousand)?(?:\s*(?:rupees?|rs\.?|inr))?)/i;
    const currMatch = lower.match(currencyAmountPattern);
    if (currMatch) {
      maxPrice = parseRawAmount(currMatch[1]);
    } else {
      // Direct symbol e.g. "cycle ₹2000"
      const directSym = lower.match(/[₹]\s*([0-9,]+(?:\.[0-9]+)?\s*(?:k|thousand)?)/i);
      if (directSym) {
        maxPrice = parseRawAmount(directSym[1]);
      }
    }
  }

  // 7. Detect Category & Synonyms
  let matchedCategory = null;
  let categoryKeyword = null;

  for (const [category, synonyms] of Object.entries(CATEGORY_MAP)) {
    for (const syn of synonyms) {
      const reg = new RegExp(`\\b${escapeRegex(syn)}(?:s|es)?\\b`, 'i');
      if (reg.test(lower)) {
        matchedCategory = category;
        categoryKeyword = syn;
        break;
      }
    }
    if (matchedCategory) break;
  }

  // 8. Detect Condition
  let matchedCondition = null;
  for (const [cond, regexList] of Object.entries(CONDITION_MAP)) {
    for (const reg of regexList) {
      if (reg.test(lower)) {
        matchedCondition = cond;
        break;
      }
    }
    if (matchedCondition) break;
  }

  // 9. Detect Sorting Preference
  let sortBy = 'relevance';
  if (/\b(?:cheapest|lowest\s+price|low\s+to\s+high|price\s+low)\b/i.test(lower)) {
    sortBy = 'price_asc';
  } else if (/\b(?:most\s+expensive|highest\s+price|high\s+to\s+low|price\s+high)\b/i.test(lower)) {
    sortBy = 'price_desc';
  } else if (isEndingSoon || /\b(?:ending\s+soonest|time\s+left)\b/i.test(lower)) {
    sortBy = 'ending_soon';
  }

  // 10. Extract Core Search Keywords
  // Clean out prices, budget prepositions, intent phrases, and stop words
  let sanitized = lower
    .replace(/(?:between|from)\s+[^\s]+\s+(?:and|to|-)\s+[^\s]+/gi, ' ')
    .replace(/(?:under|below|less\s+than|within|maximum|max|up\s+to|at\s+most|budget\s+of|cheaper\s+than)\s+[^\s]+/gi, ' ')
    .replace(/[₹rsinr]*[0-9,]+(?:\.[0-9]+)?\s*(?:k|thousand)?(?:\s*(?:rupees?|rs\.?|inr))?/gi, ' ')
    .replace(/\b(?:ending\s+soon|ending\s+today|closing\s+soon|closing\s+today|expiring\s+soon|last\s+chance|hurry)\b/gi, ' ')
    .replace(/\b(?:compare|comparison|versus|\bvs\b|difference\s+between|which\s+is\s+better)\b/gi, ' ')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = sanitized.split(' ').filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  const keywords = words;

  // Decide overall intent
  let intent = 'SEARCH_LISTINGS';
  if (isCompare) {
    intent = 'COMPARE_LISTINGS';
  } else if (isEndingSoon && (keywords.length === 0 || words.every((w) => ['auction', 'auctions'].includes(w))) && !matchedCategory) {
    intent = 'ENDING_SOON';
  }

  return {
    raw,
    intent,
    keywords,
    category: matchedCategory,
    categoryKeyword,
    condition: matchedCondition,
    minPrice,
    maxPrice,
    sortBy,
    isEndingSoon,
  };
}

/**
 * Searches real MongoDB listings using parsed parameters and enforces strict public visibility.
 */
async function searchListings(parsed, user = null) {
  const { keywords, category, condition, minPrice, maxPrice, sortBy, isEndingSoon } = parsed;

  const now = new Date();
  const query = {
    status: 'active',
    isModerated: false,
    $and: [
      { $or: [{ publishAt: null }, { publishAt: { $lte: now } }] },
      { endsAt: { $gt: now } },
    ],
  };

  // Category filter
  if (category) {
    query.category = category;
  }

  // Condition filter
  if (condition) {
    query.condition = condition;
  }

  // Budget filter
  if (maxPrice !== null && minPrice !== null) {
    query.currentPrice = { $gte: minPrice, $lte: maxPrice };
  } else if (maxPrice !== null) {
    query.currentPrice = { $lte: maxPrice };
  } else if (minPrice !== null) {
    query.currentPrice = { $gte: minPrice };
  }

  // Keyword filter
  if (keywords && keywords.length > 0) {
    // If category is already filtered, ignore keywords that simply repeat the category name
    const filterKeywords = category
      ? keywords.filter((kw) => kw !== category && !['sports', 'electronics', 'clothing', 'furniture', 'books', 'other'].includes(kw))
      : keywords;

    if (filterKeywords.length > 0) {
      const kwConditions = filterKeywords.map((kw) => {
        let root = kw.toLowerCase();
        if (root.endsWith('ies') && root.length > 4) {
          root = root.slice(0, -3);
        } else if (root.endsWith('es') && root.length > 4) {
          root = root.slice(0, -2);
        } else if (root.endsWith('s') && root.length > 3) {
          root = root.slice(0, -1);
        }
        const pattern = `${escapeRegex(root)}(?:s|es|ies)?`;
        return {
          $or: [
            { title: { $regex: pattern, $options: 'i' } },
            { description: { $regex: pattern, $options: 'i' } },
          ],
        };
      });
      query.$and.push(...kwConditions);
    }
  }

  // Sorting
  let sortOption = { endsAt: 1 };
  if (sortBy === 'price_asc') {
    sortOption = { currentPrice: 1 };
  } else if (sortBy === 'price_desc') {
    sortOption = { currentPrice: -1 };
  } else if (sortBy === 'ending_soon' || isEndingSoon) {
    sortOption = { endsAt: 1 };
  }

  // Execute query safely, limit to 20
  const listings = await Listing.find(query)
    .sort(sortOption)
    .limit(20)
    .populate('seller', 'username')
    .lean();

  // Populate actual bid counts
  const enrichedListings = await Promise.all(
    listings.map(async (l) => {
      const bidCount = await Bid.countDocuments({ listing: l._id });
      const minNextBid = (l.currentPrice || l.startingPrice || 0) + (l.minBidIncrement || 10);
      return {
        _id: l._id,
        title: l.title,
        description: l.description,
        category: l.category,
        condition: l.condition,
        images: l.images || [],
        video: l.video || null,
        currentPrice: l.currentPrice || l.startingPrice,
        startingPrice: l.startingPrice,
        minBidIncrement: l.minBidIncrement || 10,
        minNextBid,
        bidCount,
        priceType: bidCount > 0 ? 'Current bid' : 'Starting price',
        status: l.status,
        endsAt: l.endsAt,
        seller: {
          _id: l.seller?._id,
          username: l.seller?.username || 'Student Seller',
        },
      };
    })
  );

  // Compose user-friendly assistant reply
  let reply = '';
  if (enrichedListings.length === 0) {
    reply = "I couldn't find any active listings matching your criteria. Try adjusting your search keywords, budget, or condition filter.";
  } else {
    const count = enrichedListings.length;
    const filterParts = [];
    if (parsed.categoryKeyword || parsed.category) {
      filterParts.push(`for "${parsed.categoryKeyword || parsed.category}"`);
    } else if (keywords.length > 0) {
      filterParts.push(`matching "${keywords.join(' ')}"`);
    }

    if (maxPrice !== null && minPrice !== null) {
      filterParts.push(`between ₹${minPrice.toLocaleString('en-IN')} and ₹${maxPrice.toLocaleString('en-IN')}`);
    } else if (maxPrice !== null) {
      filterParts.push(`under ₹${maxPrice.toLocaleString('en-IN')}`);
    } else if (minPrice !== null) {
      filterParts.push(`above ₹${minPrice.toLocaleString('en-IN')}`);
    }

    if (condition) {
      filterParts.push(`in ${condition} condition`);
    }

    if (isEndingSoon) {
      filterParts.push('ending soon');
    }

    const desc = filterParts.length > 0 ? ` ${filterParts.join(' ')}` : '';
    reply = `I found ${count} active ${count === 1 ? 'auction' : 'auctions'}${desc}. Note: Displayed prices reflect current bids or starting prices; final prices depend on subsequent bidding.`;
  }

  return {
    reply,
    listings: enrichedListings,
  };
}

/**
 * Objective Comparison Generator for 2 listings based on real database attributes.
 */
async function compareListings(listingIds, user = null) {
  if (!Array.isArray(listingIds) || listingIds.length < 2) {
    return {
      reply: 'Please provide or select two products to compare side-by-side.',
      listings: [],
      comparison: null,
    };
  }

  const [idA, idB] = listingIds.slice(0, 2);
  const [listingA, listingB] = await Promise.all([
    Listing.findById(idA).populate('seller', 'username').lean(),
    Listing.findById(idB).populate('seller', 'username').lean(),
  ]);

  if (!listingA || !listingB) {
    return {
      reply: 'One or both of the selected listings could not be found.',
      listings: [],
      comparison: null,
    };
  }

  // Count bids for both
  const [bidsCountA, bidsCountB] = await Promise.all([
    Bid.countDocuments({ listing: listingA._id }),
    Bid.countDocuments({ listing: listingB._id }),
  ]);

  const priceA = listingA.currentPrice || listingA.startingPrice;
  const priceB = listingB.currentPrice || listingB.startingPrice;
  const diff = Math.abs(priceA - priceB);

  let priceVerdict = '';
  if (priceA < priceB) {
    priceVerdict = `"${listingA.title}" is currently ₹${diff.toLocaleString('en-IN')} cheaper than "${listingB.title}".`;
  } else if (priceB < priceA) {
    priceVerdict = `"${listingB.title}" is currently ₹${diff.toLocaleString('en-IN')} cheaper than "${listingA.title}".`;
  } else {
    priceVerdict = 'Both listings are currently at the same price point.';
  }

  const conditionRank = { 'new': 4, 'like-new': 3, 'good': 2, 'fair': 1 };
  const rankA = conditionRank[listingA.condition] || 0;
  const rankB = conditionRank[listingB.condition] || 0;

  let conditionVerdict = '';
  if (rankA > rankB) {
    conditionVerdict = `"${listingA.title}" is rated in higher condition (${listingA.condition}) than "${listingB.title}" (${listingB.condition}).`;
  } else if (rankB > rankA) {
    conditionVerdict = `"${listingB.title}" is rated in higher condition (${listingB.condition}) than "${listingA.title}" (${listingA.condition}).`;
  } else {
    conditionVerdict = `Both items share the same condition rating (${listingA.condition}).`;
  }

  const now = new Date();
  const timeA = Math.max(0, new Date(listingA.endsAt) - now);
  const timeB = Math.max(0, new Date(listingB.endsAt) - now);

  const hoursA = Math.round(timeA / (1000 * 60 * 60));
  const hoursB = Math.round(timeB / (1000 * 60 * 60));

  const verdict = `${priceVerdict} ${conditionVerdict} "${listingA.title}" has ${bidsCountA} ${bidsCountA === 1 ? 'bid' : 'bids'} (ends in ~${hoursA}h), while "${listingB.title}" has ${bidsCountB} ${bidsCountB === 1 ? 'bid' : 'bids'} (ends in ~${hoursB}h).`;

  const itemA = {
    _id: listingA._id,
    title: listingA.title,
    category: listingA.category,
    condition: listingA.condition,
    images: listingA.images || [],
    currentPrice: priceA,
    priceType: bidsCountA > 0 ? 'Current bid' : 'Starting price',
    bidCount: bidsCountA,
    minNextBid: priceA + (listingA.minBidIncrement || 10),
    status: listingA.status,
    endsAt: listingA.endsAt,
    seller: { _id: listingA.seller?._id, username: listingA.seller?.username || 'Seller' },
  };

  const itemB = {
    _id: listingB._id,
    title: listingB.title,
    category: listingB.category,
    condition: listingB.condition,
    images: listingB.images || [],
    currentPrice: priceB,
    priceType: bidsCountB > 0 ? 'Current bid' : 'Starting price',
    bidCount: bidsCountB,
    minNextBid: priceB + (listingB.minBidIncrement || 10),
    status: listingB.status,
    endsAt: listingB.endsAt,
    seller: { _id: listingB.seller?._id, username: listingB.seller?.username || 'Seller' },
  };

  return {
    reply: `Here is an objective comparison between "${listingA.title}" and "${listingB.title}":\n\n${verdict}`,
    listings: [itemA, itemB],
    comparison: {
      itemA,
      itemB,
      priceDifference: diff,
      verdict,
    },
  };
}

/**
 * Validates whether a request is completely ambiguous or unparseable.
 */
function isAmbiguousRequest(parsed) {
  const { raw, keywords, category, condition, minPrice, maxPrice, intent } = parsed;
  if (!raw || raw.length === 0) return true;
  if (intent === 'GREETING' || intent === 'BID_HELP' || intent === 'COMPARE_LISTINGS' || intent === 'ENDING_SOON') {
    return false;
  }
  // If no category, no condition, no price, and no valid keywords
  if (!category && !condition && minPrice === null && maxPrice === null && (!keywords || keywords.length === 0)) {
    return true;
  }
  return false;
}

/**
 * Main Assistant Orchestrator for incoming user messages.
 */
async function processUserMessage(message, context = {}, user = null) {
  // Input validation & sanitization
  if (typeof message !== 'string') {
    return {
      reply: 'Please provide a valid text message.',
      intent: 'INVALID_INPUT',
      listings: [],
    };
  }

  // Length limit (max 300 chars)
  const trimmed = message.trim().slice(0, 300);
  if (!trimmed) {
    return {
      reply: 'How can I help you today? You can search for products, check auctions ending soon, or compare listings.',
      intent: 'EMPTY',
      listings: [],
    };
  }

  // Parse natural language
  const parsed = parseMessage(trimmed);

  // Check for greetings or bidding guidance
  if (parsed.intent === 'GREETING' || parsed.intent === 'BID_HELP') {
    return {
      reply: parsed.reply,
      intent: parsed.intent,
      listings: [],
    };
  }

  // Check for ambiguity
  if (isAmbiguousRequest(parsed)) {
    return {
      reply: "I'm not sure which product or category you're looking for. Could you specify an item or budget? For example: 'Find me a cycle under ₹2,000' or 'Show laptops under ₹15,000'.",
      intent: 'AMBIGUOUS',
      listings: [],
    };
  }

  // Handle comparison
  if (parsed.intent === 'COMPARE_LISTINGS') {
    // Check if context has selected listings or if user named 2 IDs
    if (context.compareListingIds && Array.isArray(context.compareListingIds) && context.compareListingIds.length >= 2) {
      const comp = await compareListings(context.compareListingIds, user);
      return {
        ...comp,
        intent: 'COMPARE_LISTINGS',
        filters: parsed,
      };
    }

    // Try finding up to 2 listings based on keywords or category
    const searchRes = await searchListings(parsed, user);
    if (searchRes.listings.length >= 2) {
      const comp = await compareListings([searchRes.listings[0]._id, searchRes.listings[1]._id], user);
      return {
        ...comp,
        intent: 'COMPARE_LISTINGS',
        filters: parsed,
      };
    } else if (searchRes.listings.length === 1) {
      return {
        reply: `I only found 1 listing ("${searchRes.listings[0].title}") matching your search. Please specify another product to compare with.`,
        intent: 'COMPARE_LISTINGS',
        listings: searchRes.listings,
        comparison: null,
        filters: parsed,
      };
    } else {
      return {
        reply: "To compare products, please search for listings first or select two items using the 'Compare' buttons on product cards.",
        intent: 'COMPARE_LISTINGS',
        listings: [],
        comparison: null,
        filters: parsed,
      };
    }
  }

  // Default: Search Listings (including ending-soon)
  const searchResult = await searchListings(parsed, user);

  return {
    reply: searchResult.reply,
    intent: parsed.intent,
    filters: {
      keywords: parsed.keywords,
      category: parsed.category,
      condition: parsed.condition,
      minPrice: parsed.minPrice,
      maxPrice: parsed.maxPrice,
      isEndingSoon: parsed.isEndingSoon,
      sortBy: parsed.sortBy,
    },
    listings: searchResult.listings,
  };
}

module.exports = {
  parseMessage,
  parseRawAmount,
  searchListings,
  compareListings,
  processUserMessage,
};
