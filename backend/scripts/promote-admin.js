/**
 * Secure CLI script to promote a registered user to administrator.
 *
 * Usage:
 *   node scripts/promote-admin.js <username_or_email>
 *
 * Example:
 *   node scripts/promote-admin.js admin@campus.edu
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const identifier = process.argv[2];

if (!identifier) {
  console.error('\n❌ Error: Please provide a username or email to promote.\n');
  console.log('Usage: node scripts/promote-admin.js <username_or_email>\n');
  process.exit(1);
}

async function promote() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campusbid';
    await mongoose.connect(mongoUri);

    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase().trim() },
        { username: identifier.trim() },
      ],
    });

    if (!user) {
      console.error(`\n❌ User not found with identifier: "${identifier}"`);
      console.log('Please register the account first through the CampusBid register page.\n');
      process.exit(1);
    }

    if (user.role === 'admin') {
      console.log(`\nℹ️ User @${user.username} (${user.email}) is already an Administrator.\n`);
      process.exit(0);
    }

    user.role = 'admin';
    await user.save();

    console.log('\n======================================================');
    console.log('🎉 SUCCESS: User Promoted to Administrator');
    console.log('======================================================');
    console.log(`  Username: @${user.username}`);
    console.log(`  Email:    ${user.email}`);
    console.log(`  Role:     ${user.role}`);
    console.log('  Access:   Granted access to /admin and /api/admin endpoints\n');

    process.exit(0);
  } catch (err) {
    console.error('Promotion error:', err.message);
    process.exit(1);
  }
}

promote();
