import 'dotenv/config';
import http from 'http';
import { execFile } from 'child_process';
import { io } from 'socket.io-client';
import pg from 'pg';
import jwt from 'jsonwebtoken';

const { Pool } = pg;

// ── Configuration ─────────────────────────────────────────────
const API_PORT = 5000;
const SOCKET_URL = `http://localhost:${API_PORT}`;
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'auctionloom',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

const pool = new Pool(DB_CONFIG);

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

function uploadMultipart(filePathOrBuffer, filename, token = null) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const crlf = '\r\n';

    const postDataStart = Buffer.from(
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="image"; filename="${filename}"${crlf}` +
      `Content-Type: image/png${crlf}${crlf}`
    );
    const postDataEnd = Buffer.from(`${crlf}--${boundary}--${crlf}`);
    const fileBuffer = Buffer.isBuffer(filePathOrBuffer) ? filePathOrBuffer : Buffer.from(filePathOrBuffer);

    const bodyBuffer = Buffer.concat([postDataStart, fileBuffer, postDataEnd]);

    const req = http.request({
      hostname: 'localhost',
      port: API_PORT,
      path: '/api/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length,
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
    req.write(bodyBuffer);
    req.end();
  });
}

const results = [];

function assert(phase, testName, condition, details = '') {
  const passed = !!condition;
  results.push({ phase, testName, passed, details });
  const mark = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${phase}] ${mark} - ${testName} ${details ? `(${details})` : ''}`);
  if (!passed) {
    throw new Error(`Assertion failed: [${phase}] ${testName}`);
  }
}

async function runVerification() {
  console.log('===========================================================');
  console.log('   AUCTIONLOOM: END-TO-END VERIFICATION SUITE (PHASES 1-11)   ');
  console.log('===========================================================\n');

  // ============================================================
  // PHASE 1: Server up, API catalogue and unknown routes
  // ============================================================
  console.log('--- Checking Phase 1: Server & API catalogue ---');

  const rootRes = await request('GET', '/');
  assert('Phase 1', 'GET / answers that the API is online', rootRes.status === 200 && rootRes.data.status === 'online');
  const catalogueRes = await request('GET', '/api');
  assert('Phase 1', 'GET /api lists the REST resources', catalogueRes.status === 200 && !!catalogueRes.data.resources?.auctions);
  const unknownRes = await request('GET', '/api/does-not-exist');
  assert('Phase 1', 'Unknown route answered with a JSON 404', unknownRes.status === 404 && typeof unknownRes.data.error === 'string');

  // ============================================================
  // PHASE 2: Database Setup & Connectivity
  // ============================================================
  console.log('\n--- Checking Phase 2: PostgreSQL Schema & Database ---');
  const dbTest = await pool.query('SELECT NOW() as current_time');
  assert('Phase 2', 'PostgreSQL database is alive and responding', dbTest.rows.length > 0, `time=${dbTest.rows[0].current_time}`);

  const tableQuery = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);
  const tableNames = tableQuery.rows.map(r => r.table_name);
  const expectedTables = ['users', 'auctions', 'bids', 'jobs', 'commission_proofs', 'wallets', 'wallet_transactions', 'payment_requests'];
  const missingTables = expectedTables.filter(t => !tableNames.includes(t));
  assert('Phase 2', 'All 8 tables exist after migration', missingTables.length === 0, missingTables.length ? `missing: ${missingTables.join(', ')}` : '');

  const openJobIndex = await pool.query(
    `SELECT indexdef FROM pg_indexes WHERE tablename = 'jobs' AND indexname = 'unique_open_job'`
  );
  assert('Phase 2', 'Jobs table has a unique index on OPEN jobs only (pending or running)',
    openJobIndex.rowCount === 1 && /WHERE/i.test(openJobIndex.rows[0].indexdef));

  // ============================================================
  // PHASE 3: Core API, Middlewares, Authentication & RBAC
  // ============================================================
  console.log('\n--- Checking Phase 3: Core API & Middlewares ---');

  // Health check & Rate limiter headers
  const healthRes = await request('GET', '/health');
  assert('Phase 3', 'GET /health returns 200 OK', healthRes.status === 200, `pid=${healthRes.data.pid}`);
  assert('Phase 3', 'Rate limiter middleware active (headers present)', healthRes.headers['ratelimit-limit'] !== undefined, `limit=${healthRes.headers['ratelimit-limit']}`);

  // Register seller
  const uniqueId = Date.now();
  const sellerEmail = `verify_seller_${uniqueId}@test.com`;
  const sellerReg = await request('POST', '/api/auth/register', {
    email: sellerEmail,
    password: 'Password@123',
    role: 'auctioneer',
  });
  assert('Phase 3', 'Register new auctioneer returns 201 Created', sellerReg.status === 201);
  assert('Phase 3', 'Register returns JWT token', !!sellerReg.data.token);
  const sellerToken = sellerReg.data.token;
  const sellerId = sellerReg.data.user.id;

  // Duplicate registration rejection
  const dupReg = await request('POST', '/api/auth/register', {
    email: sellerEmail,
    password: 'Password@123',
    role: 'auctioneer',
  });
  assert('Phase 3', 'Duplicate email registration correctly rejected with 409 Conflict', dupReg.status === 409);

  // Login
  const loginRes = await request('POST', '/api/auth/login', {
    email: sellerEmail,
    password: 'Password@123',
  });
  assert('Phase 3', 'Login with correct credentials returns 200 OK', loginRes.status === 200);

  // Login failure
  const badLogin = await request('POST', '/api/auth/login', {
    email: sellerEmail,
    password: 'WrongPassword!',
  });
  assert('Phase 3', 'Login with incorrect password rejected with 401 Unauthorized', badLogin.status === 401);

  // JWT Verification /api/auth/me
  const meRes = await request('GET', '/api/auth/me', null, sellerToken);
  assert('Phase 3', 'GET /api/auth/me verifies JWT and returns authenticated user', meRes.status === 200 && meRes.data.user.email === sellerEmail);

  // Register bidder
  const bidderEmail = `verify_bidder_${uniqueId}@test.com`;
  const bidderReg = await request('POST', '/api/auth/register', {
    email: bidderEmail,
    password: 'Password@123',
    role: 'bidder',
  });
  assert('Phase 3', 'Register new bidder returns 201 Created', bidderReg.status === 201);
  const bidderToken = bidderReg.data.token;
  const bidderId = bidderReg.data.user.id;

  // RBAC check: bidder cannot create auction (roleMiddleware test)
  const forbiddenCreate = await request('POST', '/api/auctions', {
    title: 'Illegal Auction',
    starting_price: 100,
    end_time: new Date(Date.now() + 100000).toISOString(),
  }, bidderToken);
  assert('Phase 3', 'RBAC: bidder forbidden from creating auction (403 Forbidden)', forbiddenCreate.status === 403);

  // ============================================================
  // PHASE 4: Core Engine (Auction CRUD & Pessimistic Locking)
  // ============================================================
  console.log('\n--- Checking Phase 4: Auction CRUD & Concurrency Locking ---');

  // Create auction
  const endTimeFuture = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const createAuctionRes = await request('POST', '/api/auctions', {
    title: `Precision Concurrency Watch #${uniqueId}`,
    description: 'Testing PostgreSQL row-level pessimistic locking.',
    starting_price: 500.00,
    end_time: endTimeFuture,
  }, sellerToken);
  assert('Phase 4', 'Auctioneer successfully creates auction (201 Created)', createAuctionRes.status === 201);
  const auction = createAuctionRes.data.auction;
  const auctionId = auction.id;

  // Get auction
  const getAuctionRes = await request('GET', `/api/auctions/${auctionId}`);
  assert('Phase 4', 'GET /api/auctions/:id retrieves auction details', getAuctionRes.status === 200 && getAuctionRes.data.auction.id === auctionId);

  // Self-bidding rejection
  const selfBidRes = await request('POST', '/api/bids', {
    auction_id: auctionId,
    amount: 550.00,
  }, sellerToken);
  assert('Phase 4', 'Self-bidding blocked (seller cannot bid on own auction -> 400 Bad Request)', selfBidRes.status === 400);

  // Admin bidding restriction (Marketplace Neutrality Policy)
  // The admin must exist: the auth middleware reads the current role from the database,
  // so a signed token for a user who isn't there is rejected with 401.
  await pool.query(
    `INSERT INTO users (id, email, password_hash, role, name)
     VALUES ('11111111-1111-1111-1111-111111111111', 'neutrality-admin@auctionloom.test', 'NO_LOGIN', 'admin', 'Neutrality Admin')
     ON CONFLICT (id) DO UPDATE SET role = 'admin'`
  );
  const adminToken = jwt.sign(
    { id: '11111111-1111-1111-1111-111111111111', email: 'admin@auctionloom.com', role: 'admin' },
    process.env.JWT_SECRET || 'your-secret-key-min-32-chars-long!!'
  );
  const adminBidRes = await request('POST', '/api/bids', {
    auction_id: auctionId,
    amount: 550.00,
  }, adminToken);
  assert('Phase 4', 'Admin bidding blocked by marketplace neutrality policy (403 Forbidden)', adminBidRes.status === 403);

  // Admin Restriction Moderation Test
  const restrictRes = await request('PUT', `/api/admin/auctions/${auctionId}/status`, {
    status: 'RESTRICTED',
    reason: 'Suspicious bidding pattern detected for compliance review.',
  }, adminToken);
  assert('Phase 4', 'Admin can place auction under RESTRICTED status (200 OK)', restrictRes.status === 200 && restrictRes.data.auction.status === 'RESTRICTED');

  // Attempting to bid on restricted auction is rejected
  const bidOnRestricted = await request('POST', '/api/bids', {
    auction_id: auctionId,
    amount: 550.00,
  }, bidderToken);
  assert('Phase 4', 'Bidding on RESTRICTED auction blocked by platform moderation (403 Forbidden)', bidOnRestricted.status === 403);

  // Admin resumes auction
  const resumeRes = await request('PUT', `/api/admin/auctions/${auctionId}/status`, {
    status: 'ACTIVE',
  }, adminToken);
  assert('Phase 4', 'Admin can lift restriction and resume auction (200 OK)', resumeRes.status === 200 && resumeRes.data.auction.status === 'ACTIVE');

  // Bid below or equal to starting/current price rejection
  const lowBidRes = await request('POST', '/api/bids', {
    auction_id: auctionId,
    amount: 500.00,
  }, bidderToken);
  assert('Phase 4', 'Bid <= current price rejected with 400 Bad Request', lowBidRes.status === 400);

  // Valid Bid placement
  const validBidRes = await request('POST', '/api/bids', {
    auction_id: auctionId,
    amount: 550.00,
  }, bidderToken);
  assert('Phase 4', 'Valid higher bid accepted (201 Created)', validBidRes.status === 201);
  assert('Phase 4', 'Bid recorded with correct amount', parseFloat(validBidRes.data.bid.amount) === 550.00);

  // Verify auction current_price updated
  const updatedAuctionRes = await request('GET', `/api/auctions/${auctionId}`);
  assert('Phase 4', 'Auction current_price updated to latest bid amount ($550.00)', parseFloat(updatedAuctionRes.data.auction.current_price) === 550.00);

  // Concurrency Test: 2 Bidders placing bids simultaneously
  console.log('Testing simultaneous concurrent bids...');
  const bidder2Reg = await request('POST', '/api/auth/register', {
    email: `concurrent_${uniqueId}@test.com`,
    password: 'Password@123',
    role: 'bidder',
  });
  const bidder2Token = bidder2Reg.data.token;

  const [concurrentBid1, concurrentBid2] = await Promise.all([
    request('POST', '/api/bids', { auction_id: auctionId, amount: 600.00 }, bidderToken),
    request('POST', '/api/bids', { auction_id: auctionId, amount: 600.00 }, bidder2Token),
  ]);

  const successCount = (concurrentBid1.status === 201 ? 1 : 0) + (concurrentBid2.status === 201 ? 1 : 0);
  const rejectCount = (concurrentBid1.status === 400 ? 1 : 0) + (concurrentBid2.status === 400 ? 1 : 0);
  assert('Phase 4', 'Pessimistic lock prevented double-win on identical concurrent bids (1 accepted, 1 rejected)', successCount === 1 && rejectCount === 1, `201s: ${successCount}, 400s: ${rejectCount}`);

  // ============================================================
  // PHASE 5: Real-Time WebSockets
  // ============================================================
  console.log('\n--- Checking Phase 5: Socket.IO Real-Time Synchronization ---');

  const socketClient = io(SOCKET_URL, { transports: ['websocket'] });
  await new Promise((resolve) => socketClient.on('connect', resolve));
  assert('Phase 5', 'Socket.IO client connected to backend server', socketClient.connected);

  socketClient.emit('JOIN_AUCTION', auctionId);

  // Wait for PRICE_UPDATE event
  const priceUpdatePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket PRICE_UPDATE event timed out')), 5000);
    socketClient.on('PRICE_UPDATE', (data) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });

  // Trigger a bid
  const triggerBidRes = await request('POST', '/api/bids', {
    auction_id: auctionId,
    amount: 750.00,
  }, bidderToken);
  assert('Phase 5', 'Bid placed to trigger Socket event', triggerBidRes.status === 201);

  const socketEventData = await priceUpdatePromise;
  assert('Phase 5', 'Received real-time PRICE_UPDATE event via WebSocket', socketEventData.auction_id === auctionId);
  assert('Phase 5', 'PRICE_UPDATE payload contains new price $750.00', parseFloat(socketEventData.new_price) === 750.00);
  // Everyone in the room gets this event, so it identifies the bidder by id and never carries an email
  assert('Phase 5', 'PRICE_UPDATE payload identifies the bidder by id, without an email', socketEventData.bidder_id === bidderId && socketEventData.bidder_email === undefined);

  socketClient.disconnect();

  // ============================================================
  // PHASE 6: Scheduler & job worker (the real processes, run once each)
  // The test server runs with SWEEP_INTERVAL_MS=0, so only the queue closes auctions here.
  // ============================================================
  console.log('\n--- Checking Phase 6: Scheduler & Distributed Job Worker ---');

  const runOnce = (script) => new Promise((resolve, reject) => {
    execFile(process.execPath, [script, '--once'], { env: process.env, timeout: 60000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${script} --once failed: ${stderr || err.message}`));
      else resolve(stdout);
    });
  });
  const closeJobsFor = async (id) => (await pool.query(
    `SELECT status FROM jobs WHERE type = 'CLOSE_AUCTION' AND payload->>'auction_id' = $1 ORDER BY created_at`, [id]
  )).rows.map(r => r.status);

  // An auction with one real bid, whose end time has passed
  const expiredAuctionRes = await request('POST', '/api/auctions', {
    title: `Auto-Closing Auction #${uniqueId}`,
    description: 'Testing background scheduler and worker queue.',
    starting_price: 200.00,
    end_time: new Date(Date.now() + 60000).toISOString(),
  }, sellerToken);
  assert('Phase 6', 'Auction created via API for expiration test', expiredAuctionRes.status === 201);
  const expiredAuctionId = expiredAuctionRes.data.auction.id;
  const expiringBid = await request('POST', '/api/bids', { auction_id: expiredAuctionId, amount: 250 }, bidderToken);
  await pool.query(`UPDATE auctions SET end_time = NOW() - INTERVAL '10 seconds' WHERE id = $1`, [expiredAuctionId]);

  // 1. Scheduler pass: node src/workers/scheduler.js --once
  await runOnce('src/workers/scheduler.js');
  assert('Phase 6', 'Scheduler queued one PENDING CLOSE_AUCTION job for the ended auction',
    expiringBid.status === 201 && JSON.stringify(await closeJobsFor(expiredAuctionId)) === '["PENDING"]');
  await runOnce('src/workers/scheduler.js');
  assert('Phase 6', 'A second scheduler pass adds no duplicate job (unique index on open jobs)', (await closeJobsFor(expiredAuctionId)).length === 1);

  // 2. Worker pass: node src/workers/jobWorker.js --once (claims with FOR UPDATE SKIP LOCKED, runs closeAuction)
  await runOnce('src/workers/jobWorker.js');
  const finalAuctionCheck = await pool.query(`SELECT status, winner_id FROM auctions WHERE id = $1`, [expiredAuctionId]);
  assert('Phase 6', 'Worker marked the job COMPLETED', JSON.stringify(await closeJobsFor(expiredAuctionId)) === '["COMPLETED"]');
  assert('Phase 6', 'Auction status transitioned to CLOSED by worker', finalAuctionCheck.rows[0].status === 'CLOSED');
  assert('Phase 6', 'Auction winner_id correctly assigned to highest bidder', finalAuctionCheck.rows[0].winner_id === bidderId);

  // 3. A finished job doesn't block a new one: a republished auction gets a fresh close job
  const requeueLot = await request('POST', '/api/auctions', { title: `Requeue test #${uniqueId}`, starting_price: 10, duration_minutes: 60 }, sellerToken);
  const requeueId = requeueLot.data.auction.id;
  await pool.query(`UPDATE auctions SET end_time = NOW() - INTERVAL '1 second' WHERE id = $1`, [requeueId]);
  await runOnce('src/workers/scheduler.js');
  await runOnce('src/workers/jobWorker.js'); // closes it with no winner, so the seller may republish at once
  const requeueRepublish = await request('POST', `/api/auctions/${requeueId}/republish`, { end_time: new Date(Date.now() + 3600000).toISOString() }, sellerToken);
  await pool.query(`UPDATE auctions SET end_time = NOW() - INTERVAL '1 second' WHERE id = $1`, [requeueId]);
  await runOnce('src/workers/scheduler.js');
  assert('Phase 6', 'Republished auction gets a new close job after the first one COMPLETED',
    requeueRepublish.status === 200 && JSON.stringify(await closeJobsFor(requeueId)) === '["COMPLETED","PENDING"]');
  await runOnce('src/workers/jobWorker.js');

  // ============================================================
  // PHASE 7: Browser origins (CORS and the Socket.IO handshake)
  // (The React app itself is checked by the CI frontend build job.)
  // ============================================================
  console.log('\n--- Checking Phase 7: CORS & WebSocket origin allow-list ---');

  const originGet = (origin) => new Promise((resolve, reject) => {
    http.get({ hostname: 'localhost', port: API_PORT, path: '/api/auctions?limit=1', headers: { Origin: origin } }, (res) => {
      res.resume();
      resolve(res.headers['access-control-allow-origin']);
    }).on('error', reject);
  });
  assert('Phase 7', 'CORS allows the real frontend origin', (await originGet('https://auctionloom.vercel.app')) === 'https://auctionloom.vercel.app');
  assert('Phase 7', 'CORS gives no allow header to another website', (await originGet('https://evil.example')) === undefined);

  const evilSocket = io(SOCKET_URL, { transports: ['websocket'], extraHeaders: { Origin: 'https://evil.example' }, reconnection: false });
  const evilOutcome = await new Promise((resolve) => {
    evilSocket.on('connect', () => resolve('connected'));
    evilSocket.on('connect_error', () => resolve('refused'));
    setTimeout(() => resolve('timeout'), 3000);
  });
  evilSocket.disconnect();
  assert('Phase 7', 'Socket.IO handshake from another website is refused', evilOutcome === 'refused');

  // ============================================================
  // PHASE 8: AI Assistant & Copywriter
  // ============================================================
  console.log('\n--- Checking Phase 8: AI Auction Assistant ---');

  // 1. RBAC Check: Bidder forbidden from accessing /api/ai/generate
  const aiBidderRes = await request('POST', '/api/ai/generate', {
    keywords: 'Vintage Rolex',
  }, bidderToken);
  assert('Phase 8', 'RBAC: bidder forbidden from generating AI copy (403 Forbidden)', aiBidderRes.status === 403);

  // 2. Validation Check: Missing keywords returns 400 Bad Request
  const aiEmptyRes = await request('POST', '/api/ai/generate', {
    keywords: '   ',
  }, sellerToken);
  assert('Phase 8', 'Validation: empty keywords rejected with 400 Bad Request', aiEmptyRes.status === 400);

  // 3. Generation Check: Auctioneer successfully generates copy
  const aiSuccessRes = await request('POST', '/api/ai/generate', {
    keywords: '1968 Rolex Submariner Ref 5513 black dial mint',
    category: 'Watches',
  }, sellerToken);
  assert('Phase 8', 'Auctioneer receives 200 OK from AI Assistant', aiSuccessRes.status === 200);
  assert('Phase 8', 'AI response contains generated title', !!aiSuccessRes.data.title && aiSuccessRes.data.title.includes('Rolex'));
  assert('Phase 8', 'AI response contains detailed description', !!aiSuccessRes.data.description && aiSuccessRes.data.description.length > 50);
  assert('Phase 8', 'AI response provides suggested starting price', typeof aiSuccessRes.data.suggested_starting_price === 'number');

  // ============================================================
  // PHASE 9: Multer Uploads (Video 28) & Socket.IO Chat (Video 33)
  // ============================================================
  console.log('\n--- Checking Phase 9: Multer Image Upload & Socket.IO Live Room Chat ---');

  // 1. Upload an image via Multer (1x1 PNG buffer)
  const dummyPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  const uploadRes = await uploadMultipart(dummyPngBuffer, 'test-item.png', sellerToken);
  assert('Phase 9', 'Multer upload endpoint responds with 200 OK', uploadRes.status === 200);
  assert('Phase 9', 'Multer response contains valid /uploads/ URL', typeof uploadRes.data.url === 'string' && uploadRes.data.url.startsWith('/uploads/'));
  const storedUpload = await pool.query('SELECT mime_type, size_bytes FROM uploads WHERE id = $1', [uploadRes.data.url.slice('/uploads/'.length, -'.png'.length)]);
  assert('Phase 9', 'Uploaded image stored in PostgreSQL (survives restarts of a free server)', storedUpload.rowCount === 1 && storedUpload.rows[0].mime_type === 'image/png');

  // 2. Static serving check
  const staticFileRes = await new Promise((resolve) => {
    http.get(`http://localhost:${API_PORT}${uploadRes.data.url}`, (res) => {
      res.resume();
      resolve({ status: res.statusCode, contentType: res.headers['content-type'], nosniff: res.headers['x-content-type-options'] });
    }).on('error', (err) => resolve({ status: 500, error: err.message }));
  });
  assert('Phase 9', 'Uploaded image served at /uploads/* as image/png with nosniff', staticFileRes.status === 200 && staticFileRes.contentType === 'image/png' && staticFileRes.nosniff === 'nosniff');

  // An HTML page disguised as a PNG (declared type and name lie) is refused by the byte check
  const disguisedRes = await uploadMultipart(Buffer.from('<html><body><script>alert(1)</script></body></html>'), 'evil.html', sellerToken);
  assert('Phase 9', 'HTML file disguised as an image is rejected (400), never stored or served', disguisedRes.status === 400);

  // 3. Create Auction with image_url
  const auctionWithImgRes = await request('POST', '/api/auctions', {
    title: 'Multer Verified Luxury Watch',
    description: 'Rare horological timepiece uploaded via Multer with live room chat integration.',
    starting_price: 1500.00,
    end_time: new Date(Date.now() + 3600000).toISOString(),
    image_url: uploadRes.data.url,
  }, sellerToken);
  assert('Phase 9', 'Auction created with image_url returned in API response', auctionWithImgRes.status === 201 && auctionWithImgRes.data.auction.image_url === uploadRes.data.url);

  // 4. Verify PostgreSQL persistence of image_url
  const dbAuctionImg = await pool.query('SELECT image_url FROM auctions WHERE id = $1', [auctionWithImgRes.data.auction.id]);
  assert('Phase 9', 'PostgreSQL database stores image_url column', dbAuctionImg.rows[0].image_url === uploadRes.data.url);

  // 5. Socket.IO Live Room Chat (Video 33): the login token in the handshake says who is chatting
  const chatSocket = io(SOCKET_URL, { transports: ['websocket'], auth: { token: bidderToken } });
  await new Promise((resolve) => chatSocket.on('connect', resolve));
  chatSocket.emit('JOIN_AUCTION', auctionWithImgRes.data.auction.id);

  const chatPromise = new Promise((resolve) => {
    chatSocket.on('CHAT_MESSAGE', (msg) => {
      resolve(msg);
    });
  });

  chatSocket.emit('SEND_MESSAGE', {
    auctionId: auctionWithImgRes.data.auction.id,
    text: 'Is the original warranty card included with this watch?',
    // A modified client may try to claim another identity; the server must ignore all of this
    senderName: 'AuctionLoom Admin',
    senderId: sellerId,
    senderEmail: 'verified_bidder@auctionloom.com',
    role: 'admin',
  });

  const receivedChatMsg = await chatPromise;
  assert('Phase 9', 'Socket.IO CHAT_MESSAGE broadcast received in real time', receivedChatMsg.text === 'Is the original warranty card included with this watch?');
  assert('Phase 9', 'Chat message carries the sender id and ISO timestamp, never an email', receivedChatMsg.senderId === bidderId && receivedChatMsg.senderEmail === undefined && !!receivedChatMsg.timestamp);
  assert('Phase 9', 'Chat sender name and role come from the server, not from the client', receivedChatMsg.role === 'bidder' && receivedChatMsg.senderName !== 'AuctionLoom Admin');

  // 6. Socket.IO Live Floating Reaction
  const reactionPromise = new Promise((resolve) => {
    chatSocket.on('REACTION', (reaction) => {
      resolve(reaction);
    });
  });

  chatSocket.emit('SEND_REACTION', {
    auctionId: auctionWithImgRes.data.auction.id,
    emoji: '🔥',
    senderEmail: 'verified_bidder@auctionloom.com',
  });

  const receivedReaction = await reactionPromise;
  assert('Phase 9', 'Socket.IO REACTION broadcast received in real time', receivedReaction.emoji === '🔥');

  chatSocket.disconnect();

  // ============================================================
  // PHASE 10: Wallet & append-only ledger
  // ============================================================
  console.log('\n--- Checking Phase 10: Wallet & append-only ledger ---');

  // 1. Verify schema tables in PostgreSQL
  const walletTableRes = await pool.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'wallets'
  `);
  const walletColumns = walletTableRes.rows.map(r => r.column_name);
  const txTableRes = await pool.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'wallet_transactions'
  `);
  const txColumns = txTableRes.rows.map(r => r.column_name);
  assert('Phase 10', 'Wallet schema: balance + version on wallets, idempotency_key + balance_after on the ledger',
    ['balance', 'version'].every(c => walletColumns.includes(c)) && ['idempotency_key', 'balance_after'].every(c => txColumns.includes(c)));

  // 2. Test GET /api/wallet
  const initialWalletRes = await request('GET', '/api/wallet', null, bidderToken);
  assert('Phase 10', 'GET /api/wallet returns 200 OK', initialWalletRes.status === 200);
  assert('Phase 10', 'Wallet response includes wallet object with balance', typeof initialWalletRes.data?.data?.wallet?.balance === 'number');
  assert('Phase 10', 'Wallet response includes transactions array', Array.isArray(initialWalletRes.data?.data?.transactions));

  const startBalance = initialWalletRes.data.data.wallet.balance;

  // 3. Test Top-Up Endpoint (POST /api/wallet/topup)
  const topupRes = await request('POST', '/api/wallet/topup', {
    amount: 500.00,
    note: 'Automated test deposit',
  }, bidderToken);
  assert('Phase 10', 'POST /api/wallet/topup returns 200 OK', topupRes.status === 200);
  assert('Phase 10', 'Top-up increments wallet balance by $500.00', parseFloat(topupRes.data?.data?.wallet?.balance) === Math.round((startBalance + 500.00) * 100) / 100);
  assert('Phase 10', 'Top-up generates a completed TOPUP transaction record', topupRes.data?.data?.transaction?.type === 'TOPUP');

  // 4. Test Overdraft Protection
  const hugeAmount = topupRes.data.data.wallet.balance + 1000000;
  const expensiveAucRes = await pool.query(
    `INSERT INTO auctions (seller_id, title, starting_price, current_price, end_time, status, winner_id)
     VALUES ($1, 'Mega Lot', $2, $2, NOW() - INTERVAL '1 hour', 'CLOSED', $3)
     RETURNING *`,
    [sellerId, hugeAmount, bidderId]
  );
  const expensiveAucId = expensiveAucRes.rows[0].id;

  const overdraftRes = await request('POST', '/api/wallet/settle-lot', {
    auctionId: expensiveAucId,
  }, bidderToken);
  assert('Phase 10', 'Overdraft attempt rejected with 400 Bad Request', overdraftRes.status === 400);
  assert('Phase 10', 'Overdraft rejection provides INSUFFICIENT_FUNDS error code', overdraftRes.data?.code === 'INSUFFICIENT_FUNDS');

  // 5. Test Atomic Escrow Lot Settlement (Winner -> Seller + Commission)
  const settleAmount = 100.00;
  const testAucRes = await pool.query(
    `INSERT INTO auctions (seller_id, title, starting_price, current_price, end_time, status, winner_id)
     VALUES ($1, 'Fine Art Lot', $2, $2, NOW() - INTERVAL '1 hour', 'CLOSED', $3)
     RETURNING *`,
    [sellerId, settleAmount, bidderId]
  );
  const testAucId = testAucRes.rows[0].id;

  // Record seller and bidder start balances
  const sellerWalletBefore = await request('GET', '/api/wallet', null, sellerToken);
  const sellerStartBalance = sellerWalletBefore.data.data.wallet.balance;
  const bidderWalletBefore = await request('GET', '/api/wallet', null, bidderToken);
  const bidderStartBalance = bidderWalletBefore.data.data.wallet.balance;

  const settleRes = await request('POST', '/api/wallet/settle-lot', {
    auctionId: testAucId,
  }, bidderToken);

  assert('Phase 10', 'POST /api/wallet/settle-lot returns 200 OK', settleRes.status === 200);
  assert('Phase 10', 'Settlement calculates 5% platform commission ($5.00 on $100.00)', settleRes.data?.data?.commission === 5.00);
  assert('Phase 10', 'Settlement pays seller net amount ($95.00 on $100.00)', settleRes.data?.data?.sellerPayout === 95.00);

  // 6. Verify Database Balances Post-Settlement
  const bidderWalletAfter = await request('GET', '/api/wallet', null, bidderToken);
  assert('Phase 10', 'Winner balance decremented by exactly hammer price ($100.00)', bidderWalletAfter.data.data.wallet.balance === Math.round((bidderStartBalance - 100.00) * 100) / 100);

  const sellerWalletAfter = await request('GET', '/api/wallet', null, sellerToken);
  assert('Phase 10', 'Seller balance credited by exactly net payout ($95.00)', sellerWalletAfter.data.data.wallet.balance === Math.round((sellerStartBalance + 95.00) * 100) / 100);

  // 7. Verify Idempotency (settling the same auction again does not double-deduct)
  const duplicateSettleRes = await request('POST', '/api/wallet/settle-lot', {
    auctionId: testAucId,
  }, bidderToken);
  assert('Phase 10', 'Idempotent re-settlement returns 200 OK without double-deduction', duplicateSettleRes.status === 200);

  const bidderWalletIdempotent = await request('GET', '/api/wallet', null, bidderToken);
  assert('Phase 10', 'Idempotency invariant maintained (balance remained unchanged)', bidderWalletIdempotent.data.data.wallet.balance === bidderWalletAfter.data.data.wallet.balance);

  // 8. Test Commission Settlement from Wallet (POST /api/wallet/settle-commission)
  await pool.query('UPDATE users SET unpaid_commission = 50.00 WHERE id = $1', [sellerId]);
  const commSettleRes = await request('POST', '/api/wallet/settle-commission', {
    amount: 50.00,
  }, sellerToken);
  assert('Phase 10', 'POST /api/wallet/settle-commission returns 200 OK', commSettleRes.status === 200);
  assert('Phase 10', 'Seller unpaid_commission cleared to 0.00', commSettleRes.data?.data?.remainingUnpaid === 0);

  // 9. Verify Ledger History Audit Integrity
  const finalLedgerRes = await request('GET', '/api/wallet', null, bidderToken);
  const txs = finalLedgerRes.data?.data?.transactions;
  assert('Phase 10', 'Ledger lists the wallet history (top-up and settlement entries)', Array.isArray(txs) && txs.length >= 2);
  assert('Phase 10', 'Ledger tracks balance_after snapshot on every transaction', txs.every(t => typeof t.balanceAfter === 'number'));

  // ============================================================
  // PHASE 11: Regression checks from the pre-interview audit
  // ============================================================
  console.log('\n--- Checking Phase 11: Audit regression checks ---');

  const endAuctionNow = async (id) => {
    await pool.query(`UPDATE auctions SET end_time = NOW() - INTERVAL '1 second' WHERE id = $1`, [id]);
    return request('GET', `/api/auctions/${id}`); // closes it just in time
  };

  // 1. Money precision: whole cents only, so two bids can never tie after rounding
  const centsAuctionRes = await request('POST', '/api/auctions', {
    title: `Cents Precision Lot #${uniqueId}`,
    starting_price: 100,
    end_time: new Date(Date.now() + 3600000).toISOString(),
  }, sellerToken);
  const centsAuctionId = centsAuctionRes.data.auction.id;
  const firstCentsBid = await request('POST', '/api/bids', { auction_id: centsAuctionId, amount: 101 }, bidderToken);
  const threeDecimalBid = await request('POST', '/api/bids', { auction_id: centsAuctionId, amount: 101.004 }, bidder2Token);
  assert('Phase 11', 'Bid with 3 decimal places (101.004) rejected with 400 instead of being rounded into a tie', firstCentsBid.status === 201 && threeDecimalBid.status === 400);
  const centsBid = await request('POST', '/api/bids', { auction_id: centsAuctionId, amount: '101.01' }, bidder2Token);
  assert('Phase 11', 'Bid one cent higher (101.01) accepted', centsBid.status === 201);
  const storedCentsBids = await pool.query('SELECT amount FROM bids WHERE auction_id = $1 ORDER BY created_at', [centsAuctionId]);
  assert('Phase 11', 'Stored bid amounts are strictly increasing (no ties)', storedCentsBids.rows.map(r => r.amount).join(',') === '101.00,101.01');

  // 2. "Won" is decided by winner_id only: the outbid bidder does not see the lot as won
  await endAuctionNow(centsAuctionId);
  const winnerWon = await request('GET', '/api/users/me/won', null, bidder2Token);
  const loserWon = await request('GET', '/api/users/me/won', null, bidderToken);
  const loserBids = await request('GET', '/api/users/me/bids', null, bidderToken);
  assert('Phase 11', 'Only the real winner lists the closed lot under won auctions',
    winnerWon.data.won.some(a => a.id === centsAuctionId) && !loserWon.data.won.some(a => a.id === centsAuctionId));
  assert('Phase 11', 'Outbid bidder sees is_winner = false for that lot',
    loserBids.data.participations.find(p => p.id === centsAuctionId)?.is_winner === false);
  assert('Phase 11', 'My-bids list never reveals the seller\'s email (bidding must not leak it)',
    loserBids.data.participations.every(p => p.seller_email === undefined && p.winner_email === undefined));

  // 3. Errors: every response carries a request id, and a broken JSON body is a 400 with a plain message
  const badJsonRes = await new Promise((resolve, reject) => {
    const req = http.request({ hostname: 'localhost', port: API_PORT, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.end('{not json');
  });
  assert('Phase 11', 'Malformed JSON body answered 400 with a plain message (no parser internals)', badJsonRes.status === 400 && badJsonRes.data.error === 'Request body is not valid JSON.');
  assert('Phase 11', 'Responses carry an X-Request-Id header for log lookup', typeof badJsonRes.headers['x-request-id'] === 'string' && badJsonRes.headers['x-request-id'].length > 10);

  // 4. Input validation: bad input is a 400 with a plain message, never a database error
  const badInputCases = [
    ['GET', '/api/auctions?seller_id=abc', null, null],
    ['GET', '/api/auctions?status=ACTIVE&status=CLOSED', null, null],
    ['POST', '/api/wallet/topup', { amount: 99999999999 }, bidderToken],
    ['POST', '/api/wallet/topup', { amount: 10.555 }, bidderToken],
    ['POST', '/api/wallet/settle-lot', { auctionId: 'not-a-uuid' }, bidderToken],
    ['POST', '/api/auctions', { title: 'x'.repeat(300), starting_price: 10, duration_minutes: 5 }, sellerToken],
    ['POST', '/api/auctions', { title: 'Too far', starting_price: 10, end_time: new Date(Date.now() + 400 * 86400000).toISOString() }, sellerToken],
    ['POST', '/api/auth/register', { email: 'not-an-email', password: 'Password@123' }, null],
    ['POST', '/api/auth/register', { email: `short_${uniqueId}@test.com`, password: '1' }, null],
    ['POST', '/api/auth/login', { email: 123, password: 'x' }, null],
    ['GET', '/api/users/auction-payout/not-a-uuid', null, bidderToken],
    ['GET', '/api/admin/commission-ledger?from=abc', null, adminToken],
    ['PUT', '/api/admin/users/not-a-uuid/role', { role: 'bidder' }, adminToken],
  ];
  const badInputResults = [];
  for (const [method, path, body, token] of badInputCases) {
    const r = await request(method, path, body, token);
    badInputResults.push({ path, status: r.status, error: r.data?.error || '' });
  }
  const notRejected = badInputResults.filter(r => r.status !== 400);
  assert('Phase 11', `All ${badInputCases.length} malformed inputs rejected with 400`, notRejected.length === 0, notRejected.map(r => `${r.path} -> ${r.status}`).join('; '));
  const leaky = badInputResults.filter(r => /syntax|violates|overflow|character varying|is not a function|pg_|relation/i.test(r.error));
  assert('Phase 11', 'No error message exposes database or code internals', leaky.length === 0, leaky.map(r => r.error).join('; '));

  // 5. Chat needs a login: a guest's message is refused and never broadcast
  const chatRoomId = centsAuctionId;
  const listener = io(SOCKET_URL, { transports: ['websocket'] });
  const guest = io(SOCKET_URL, { transports: ['websocket'] });
  await Promise.all([listener, guest].map((s) => new Promise((resolve) => s.on('connect', resolve))));
  listener.emit('JOIN_AUCTION', chatRoomId);
  const heard = [];
  listener.on('CHAT_MESSAGE', (m) => heard.push(m));
  const guestError = new Promise((resolve) => guest.on('CHAT_ERROR', resolve));
  guest.emit('SEND_MESSAGE', { auctionId: chatRoomId, text: 'Pay me directly at evil.example', senderName: 'AuctionLoom Admin', role: 'admin' });
  const guestErr = await Promise.race([guestError, new Promise((r) => setTimeout(() => r(null), 2000))]);
  await new Promise((r) => setTimeout(r, 300));
  assert('Phase 11', 'Guest chat message refused with CHAT_ERROR and not broadcast', !!guestErr && heard.length === 0);

  // 6. Flood control: the 6th message within 10 seconds is refused
  const flooder = io(SOCKET_URL, { transports: ['websocket'], auth: { token: bidderToken } });
  await new Promise((resolve) => flooder.on('connect', resolve));
  const floodError = new Promise((resolve) => flooder.on('CHAT_ERROR', resolve));
  for (let i = 1; i <= 6; i++) flooder.emit('SEND_MESSAGE', { auctionId: chatRoomId, text: `message ${i}` });
  const floodErr = await Promise.race([floodError, new Promise((r) => setTimeout(() => r(null), 2000))]);
  await new Promise((r) => setTimeout(r, 300));
  assert('Phase 11', 'Chat flood control: 5 messages delivered, the 6th refused', !!floodErr && heard.length === 5);
  [listener, guest, flooder].forEach((s) => s.disconnect());

  // 7. Admin benchmark: runs the real bid code on a throw-away lot and reports checks it computed
  const benchRes = await request('POST', '/api/admin/system/run-benchmark', { requests: 40 }, adminToken);
  const bench = benchRes.data?.data;
  const benchLotLeft = bench ? await pool.query('SELECT 1 FROM auctions WHERE id = $1', [bench.dbState.auctionId]) : { rowCount: 1 };
  assert('Phase 11', 'Admin benchmark checks the database (all checks true, 0 race conditions) and deletes its lot',
    benchRes.status === 200 && bench.dbState.raceConditionsDetected === 0 &&
    Object.values(bench.dbState.checks).every(Boolean) && bench.successfulBids + bench.rejectedBids === 40 && benchLotLeft.rowCount === 0,
    benchRes.status === 200 ? `accepted ${bench.successfulBids}, refused ${bench.rejectedBids}` : JSON.stringify(benchRes.data));
  const benchTooBig = await request('POST', '/api/admin/system/run-benchmark', { requests: 100000 }, adminToken);
  assert('Phase 11', 'Admin benchmark size is capped (100000 requests -> 400)', benchTooBig.status === 400);

  // 8. Admin users table: a user with 2 listings, 2 bids ($110 + $120) and 2 wins must show $230, not 2 x 2 x $230
  const multiReg = await request('POST', '/api/auth/register', { email: `fanout_${uniqueId}@test.com`, password: 'Password@123', role: 'auctioneer', name: `Fanout ${uniqueId}` });
  const multiToken = multiReg.data.token;
  const multiId = multiReg.data.user.id;
  for (const t of ['Fan-out listing A', 'Fan-out listing B']) {
    await request('POST', '/api/auctions', { title: t, starting_price: 50, duration_minutes: 60 }, multiToken);
  }
  const fanLots = [];
  for (const price of [110, 120]) {
    const lot = await request('POST', '/api/auctions', { title: `Fan-out lot ${price}`, starting_price: 100, duration_minutes: 60 }, sellerToken);
    await request('POST', `/api/auctions/${lot.data.auction.id}/bids`, { amount: price }, multiToken);
    fanLots.push(lot.data.auction.id);
  }
  for (const id of fanLots) await endAuctionNow(id);
  const adminUsers = await request('GET', `/api/admin/users?search=fanout_${uniqueId}`, null, adminToken);
  const fanRow = adminUsers.data.users.find(u => u.id === multiId);
  // 9. Settlement re-checks the lot under its row lock: a stale winner or price moves no money
  const lotForRecheck = (await pool.query('SELECT winner_id, seller_id FROM auctions WHERE id = $1', [centsAuctionId])).rows[0];
  const settleScript = (args) => new Promise((resolve) => execFile(process.execPath, ['-e', `
    const w = require('./src/services/walletService');
    w.settleLotEscrow(${JSON.stringify(args)})
      .then(() => console.log('SETTLED'), (e) => console.log('REFUSED ' + (e.statusCode || e.message)))
      .finally(() => require('./src/db').end());
  `], { env: process.env, timeout: 30000 }, (err, stdout) => resolve((stdout || '').trim().split('\n').pop())));
  const wrongPrice = await settleScript({ auctionId: centsAuctionId, winnerId: lotForRecheck.winner_id, sellerId: lotForRecheck.seller_id, hammerPrice: 1 });
  const wrongWinner = await settleScript({ auctionId: centsAuctionId, winnerId: bidderId, sellerId: lotForRecheck.seller_id, hammerPrice: 101.01 });
  const debitsForLot = (await pool.query(`SELECT count(*)::int AS c FROM wallet_transactions WHERE reference_id = $1`, [centsAuctionId])).rows[0].c;
  assert('Phase 11', 'Settlement with a stale price or winner is refused (409) and moves no money',
    wrongPrice === 'REFUSED 409' && wrongWinner === 'REFUSED 409' && debitsForLot === 0, `${wrongPrice} / ${wrongWinner} / ledger rows ${debitsForLot}`);

  // 10. A lot that was paid for can't be deleted, not even by an admin (it is part of the money records)
  const deletePaidLot = await request('DELETE', `/api/admin/auctions/${testAucId}`, null, adminToken);
  const paidLotStill = await pool.query('SELECT 1 FROM auctions WHERE id = $1', [testAucId]);
  assert('Phase 11', 'Admin delete of a paid lot refused (409) and the lot stays', deletePaidLot.status === 409 && paidLotStill.rowCount === 1);

  // 11. Login brute force: after 10 failed attempts for one email, the 11th is refused with 429
  const bruteEmail = `brute_${uniqueId}@test.com`;
  let lastBrute;
  for (let i = 0; i < 11; i++) {
    lastBrute = await request('POST', '/api/auth/login', { email: bruteEmail, password: `wrong-${i}` });
  }
  assert('Phase 11', 'Login limiter: 11th failed login for one account answered 429', lastBrute.status === 429);
  const otherLogin = await request('POST', '/api/auth/login', { email: sellerEmail, password: 'Password@123' });
  assert('Phase 11', 'Other accounts can still log in from the same IP', otherLogin.status === 200);

  assert('Phase 11', 'Admin users table shows real totals (2 listings, 2 bids, 2 wins, $230 bid volume)',
    fanRow && fanRow.listings_count === 2 && fanRow.total_bids === 2 && fanRow.auctions_won === 2 && fanRow.total_spent === 230,
    fanRow ? `listings ${fanRow.listings_count}, bids ${fanRow.total_bids}, wins ${fanRow.auctions_won}, volume ${fanRow.total_spent}` : 'user not listed');

  console.log('\n===========================================================');
  console.log('   🎉 ALL PHASES (1 TO 11) PASSED  ');
  console.log('===========================================================');
  console.log(`Total assertions passed: ${results.length}/${results.length}`);
}

runVerification()
  .catch((err) => {
    console.error('\n❌ VERIFICATION RUN FAILED:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
