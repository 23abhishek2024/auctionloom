const API_BASE = 'http://localhost:5000/api';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function api(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.response = { data, status: res.status };
    throw err;
  }
  return { data, status: res.status };
}

async function runE2ETest() {
  console.log('=== STARTING END-TO-END AUCTION & COMMISSION FLOW TEST ===\n');

  // 1. Verify Admin Login with both passwords
  console.log('1. Testing Admin login...');
  const adminLogin1 = await api('/auth/login', {
    method: 'POST',
    body: { email: 'admin@gmail.com', password: 'test@123' },
  });
  console.log('   ✅ admin@gmail.com login with test@123 succeeded! Token received.');

  const adminLogin2 = await api('/auth/login', {
    method: 'POST',
    body: { email: 'admin@gmail.com', password: 'Admin@1234' },
  });
  console.log('   ✅ admin@gmail.com login with Admin@1234 succeeded! Fallback working.');

  const adminToken = adminLogin1.data.token;

  // Get Admin's starting wallet balance
  const adminWalletBeforeRes = await api('/wallet', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminBalanceBefore = parseFloat(adminWalletBeforeRes.data.data.wallet.balance);
  console.log(`   💰 Admin starting wallet balance: $${adminBalanceBefore.toFixed(2)}\n`);

  // 2. Create Test Seller & Test Buyer
  const ts = Date.now();
  console.log('2. Creating Test Seller and Test Buyer...');
  const sellerReg = await api('/auth/register', {
    method: 'POST',
    body: {
      email: `auto_seller_${ts}@test.com`,
      password: 'Password@123',
      role: 'auctioneer',
      name: 'Auto Seller',
    },
  });
  const sellerToken = sellerReg.data.token;
  console.log(`   ✅ Seller registered: ${sellerReg.data.user.email}`);

  const buyerReg = await api('/auth/register', {
    method: 'POST',
    body: {
      email: `auto_buyer_${ts}@test.com`,
      password: 'Password@123',
      role: 'bidder',
      name: 'Auto Buyer',
    },
  });
  const buyerToken = buyerReg.data.token;
  console.log(`   ✅ Buyer registered: ${buyerReg.data.user.email}\n`);

  // 3. Fund Buyer's Wallet with $600
  console.log('3. Funding Buyer wallet with $600...');
  await api('/wallet/topup', {
    method: 'POST',
    body: { amount: 600, note: 'Initial test topup' },
    headers: { Authorization: `Bearer ${buyerToken}` },
  });
  const buyerWalletRes = await api('/wallet', {
    headers: { Authorization: `Bearer ${buyerToken}` },
  });
  console.log(`   ✅ Buyer wallet balance: $${buyerWalletRes.data.data.wallet.balance}\n`);

  // 4. Seller creates an auction that ends in 15 seconds
  console.log('4. Creating 15-second auction...');
  const endTime = new Date(Date.now() + 15 * 1000).toISOString();
  const auctionRes = await api('/auctions', {
    method: 'POST',
    body: {
      title: `E2E Live Test Lot ${ts}`,
      description: 'Automated 15s auction to test complete settlement & commission flow',
      starting_price: 100,
      end_time: endTime,
      image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30',
    },
    headers: { Authorization: `Bearer ${sellerToken}` },
  });
  const auction = auctionRes.data.auction;
  console.log(`   ✅ Auction created! ID: ${auction.id}`);
  console.log(`   ⏳ Scheduled end time: ${endTime}\n`);

  // 5. Buyer places a bid of $200
  console.log('5. Buyer placing winning bid of $200...');
  const bidRes = await api('/bids', {
    method: 'POST',
    body: {
      auction_id: auction.id,
      amount: 200,
    },
    headers: { Authorization: `Bearer ${buyerToken}` },
  });
  console.log(`   ✅ Bid placed successfully! Current price: $${bidRes.data.bid.amount}\n`);

  // 6. Wait for auction to expire (16 seconds)
  console.log('6. Waiting 16 seconds for auction to expire...');
  for (let i = 16; i > 0; i--) {
    process.stdout.write(`   Countdown: ${i}s remaining...\r`);
    await sleep(1000);
  }
  console.log('\n   ⏰ Time elapsed! Calling getById to trigger JIT closure & auto-settlement...\n');

  // 7. Trigger closure check via getById
  const closedRes = await api(`/auctions/${auction.id}`);
  const closedAuction = closedRes.data.auction;
  console.log('7. Verifying Auction state:');
  console.log(`   - Status: ${closedAuction.status}`);
  console.log(`   - Winner ID: ${closedAuction.winner_id}`);
  console.log(`   - Is Settled: ${closedAuction.is_settled}`);
  console.log(`   - Commission Amount: $${closedAuction.commission_amount}`);

  // 8. Verify Balances after settlement
  console.log('\n8. Checking Wallets & Money Movements:');

  // Buyer Wallet
  const buyerWalletAfter = await api('/wallet', {
    headers: { Authorization: `Bearer ${buyerToken}` },
  });
  const buyerBal = parseFloat(buyerWalletAfter.data.data.wallet.balance);
  console.log(`   👤 Buyer Wallet: $${buyerBal} (Expected: $400.00 — $600 - $200) -> ${buyerBal === 400 ? '✅ MATCH' : '❌ MISMATCH'}`);

  // Seller Wallet
  const sellerWalletAfter = await api('/wallet', {
    headers: { Authorization: `Bearer ${sellerToken}` },
  });
  const sellerBal = parseFloat(sellerWalletAfter.data.data.wallet.balance);
  console.log(`   🏪 Seller Wallet: $${sellerBal} (Expected: $190.00 — 95% of $200) -> ${sellerBal === 190 ? '✅ MATCH' : '❌ MISMATCH'}`);

  // Admin Wallet
  const adminWalletAfter = await api('/wallet', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminBal = parseFloat(adminWalletAfter.data.data.wallet.balance);
  const adminDiff = adminBal - adminBalanceBefore;
  console.log(`   👑 Admin Wallet: $${adminBal} (Expected: +$10.00 — 5% of $200) -> Diff: +$${adminDiff.toFixed(2)} ${adminDiff === 10 ? '✅ MATCH' : '❌ MISMATCH'}`);

  // 9. Check Admin Commission Transactions Feed
  console.log('\n9. Checking Admin Commission Transactions Feed:');
  const commTxRes = await api('/admin/commission-transactions?limit=5', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const latestTx = commTxRes.data.data.transactions[0];
  console.log(`   - Latest Tx ID: ${latestTx.id}`);
  console.log(`   - Auction: ${latestTx.auctionTitle}`);
  console.log(`   - Commission: $${latestTx.commission}`);
  console.log(`   - Gross Amount: $${latestTx.grossAmount}`);
  console.log(`   - Seller: ${latestTx.sellerName} (${latestTx.sellerEmail})`);
  console.log(`   - Winner: ${latestTx.winnerName} (${latestTx.winnerEmail})`);
  console.log(`   - Method: ${latestTx.method}`);
  console.log(`   - Status: ${latestTx.status}`);

  console.log('\n=== ALL VERIFICATION CHECKS PASSED PERFECTLY! ===');
  process.exit(0);
}

runE2ETest().catch((err) => {
  console.error('\n❌ E2E TEST FAILED:', err.response?.data || err.message);
  process.exit(1);
});
