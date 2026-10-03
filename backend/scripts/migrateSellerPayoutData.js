require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const SellerProfile = require('../models/SellerProfile');
const { storePayoutAccount } = require('../services/sellerPayoutData');

const migrate = async () => {
  const connected = await connectDB();
  if (!connected) throw new Error('MongoDB is required to migrate seller payout data');

  let migrated = 0;
  const profiles = await SellerProfile.find({}).select('+payoutAccountEncrypted');
  for (const profile of profiles) {
    const accountNumber = profile.payoutAccount?.accountNumber;
    if (!accountNumber || profile.payoutAccountEncrypted) continue;
    storePayoutAccount(profile, profile.payoutAccount);
    await profile.save();
    migrated += 1;
  }

  console.log(`Encrypted payout account data for ${migrated} seller profile(s).`);
};

migrate()
  .catch((error) => {
    console.error('Seller payout data migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
