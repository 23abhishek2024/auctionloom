import http from 'http';

const API_PORT = 5000;

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: API_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(resData); } catch { parsed = resData; }
        resolve({ status: res.statusCode, headers: res.headers, data: parsed });
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function assert(title, condition, details = '') {
  if (condition) {
    console.log(`✅ PASS: ${title} ${details ? `(${details})` : ''}`);
  } else {
    console.error(`❌ FAIL: ${title} ${details ? `(${details})` : ''}`);
    process.exit(1);
  }
}

async function run() {
  console.log('=== VERIFYING API ARCHITECTURAL REFINEMENTS ===\n');

  // 1. GET /api - API Catalog
  const apiCatalog = await request('GET', '/api');
  assert('GET /api returns 200 OK', apiCatalog.status === 200);
  assert('GET /api contains resources catalog', !!apiCatalog.data.resources && !!apiCatalog.data.resources.auctions);

  // 2. 404 Fallback JSON
  const notFound = await request('GET', '/api/non_existent_route');
  assert('GET /api/non_existent_route returns 404', notFound.status === 404);
  assert('404 response is JSON with error message', !!notFound.data.error);

  // 3. Login as test user
  const loginRes = await request('POST', '/api/auth/login', {
    email: 'test1@gmail.com',
    password: 'test@123',
  });
  assert('Login as test1@gmail.com returns 200', loginRes.status === 200);
  const token = loginRes.data.token;

  // 4. Query filtering on GET /api/auctions
  const allAuctionsRes = await request('GET', '/api/auctions');
  assert('GET /api/auctions returns 200', allAuctionsRes.status === 200);
  assert('Envelope contains auctions array and count', Array.isArray(allAuctionsRes.data.auctions) && typeof allAuctionsRes.data.count === 'number');

  const filteredAuctionsRes = await request('GET', '/api/auctions?status=ACTIVE&sort=price_desc&limit=2');
  assert('GET /api/auctions with filter/sort/limit returns 200', filteredAuctionsRes.status === 200);
  assert('Limit respected (<= 2)', filteredAuctionsRes.data.auctions.length <= 2);

  const auctionId = allAuctionsRes.data.auctions[0]?.id;
  assert('Sample auction exists', !!auctionId);

  // 5. Invalid UUID validation
  const badIdRes = await request('GET', '/api/auctions/not-a-valid-uuid');
  assert('Invalid UUID on GET /api/auctions/:id returns 400 Bad Request (not 500)', badIdRes.status === 400);

  const badBidIdRes = await request('GET', '/api/bids/not-a-valid-uuid');
  assert('Invalid UUID on GET /api/bids/:id returns 400 Bad Request (not 500)', badBidIdRes.status === 400);

  const badBidPostRes = await request('POST', '/api/bids', { auction_id: 'bad-uuid', amount: 100 }, token);
  assert('Invalid UUID on POST /api/bids returns 400 Bad Request', badBidPostRes.status === 400);

  const badAmountRes = await request('POST', '/api/bids', { auction_id: auctionId, amount: -50 }, token);
  assert('Negative amount on POST /api/bids returns 400 Bad Request', badAmountRes.status === 400);

  // 6. Nested RESTful routes
  const nestedBidsRes = await request('GET', `/api/auctions/${auctionId}/bids`);
  assert('GET /api/auctions/:id/bids returns 200 OK', nestedBidsRes.status === 200);
  assert('Nested bids envelope contains bids array and count', Array.isArray(nestedBidsRes.data.bids) && typeof nestedBidsRes.data.count === 'number');

  // 7. User Hub response consistency
  const userBids = await request('GET', '/api/users/me/bids', null, token);
  assert('GET /api/users/me/bids returns 200', userBids.status === 200);
  assert('Envelope provides both participations and bids', Array.isArray(userBids.data.participations) && Array.isArray(userBids.data.bids));

  const userWon = await request('GET', '/api/users/me/won', null, token);
  assert('GET /api/users/me/won returns 200', userWon.status === 200);
  assert('Envelope provides both wonAuctions and won', Array.isArray(userWon.data.wonAuctions) && Array.isArray(userWon.data.won));

  const userAuctions = await request('GET', '/api/users/me/auctions', null, token);
  assert('GET /api/users/me/auctions returns 200', userAuctions.status === 200);
  assert('Envelope provides count', typeof userAuctions.data.count === 'number');

  console.log('\n🎉 ALL 18 API ARCHITECTURAL SPECIFICATION CHECKS PASSED!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
