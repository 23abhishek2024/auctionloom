const bcrypt = require('bcrypt');
const pool = require('../src/db');

const SALT_ROUNDS = 10;
const DEFAULT_PASSWORD = 'test@123';

async function resetAndSeed() {
  console.log('🔄 [Reset & Seed] Starting complete database purge and seeding...');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Ensure schema and 'name' column exist
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
      ALTER TABLE auctions ADD COLUMN IF NOT EXISTS image_url TEXT;
    `);

    // 2. Clear all existing data cleanly
    console.log('🧹 [Reset & Seed] Truncating bids, jobs, auctions, users...');
    await client.query('TRUNCATE TABLE bids CASCADE;');
    await client.query('TRUNCATE TABLE jobs CASCADE;');
    await client.query('TRUNCATE TABLE auctions CASCADE;');
    await client.query('TRUNCATE TABLE users CASCADE;');

    // 3. Hash common password
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS);

    // 4. Seed user accounts (both @gmail.com and @gamil.com to avoid typo issues)
    console.log('👥 [Reset & Seed] Creating fresh member accounts (test1..test5)...');
    const userDefs = [
      { name: 'Test1', email: 'test1@gmail.com', alt: 'test1@gamil.com', role: 'auctioneer' },
      { name: 'Test2', email: 'test2@gmail.com', alt: 'test2@gamil.com', role: 'auctioneer' },
      { name: 'Test3', email: 'test3@gmail.com', alt: 'test3@gamil.com', role: 'auctioneer' },
      { name: 'Test4', email: 'test4@gmail.com', alt: 'test4@gamil.com', role: 'auctioneer' },
      { name: 'Test5', email: 'test5@gmail.com', alt: 'test5@gamil.com', role: 'auctioneer' },
      { name: 'Admin', email: 'admin@gmail.com', alt: 'admin@gamil.com', role: 'admin' },
    ];

    const usersMap = {};

    for (const u of userDefs) {
      // Primary email (@gmail.com)
      const res = await client.query(
        'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
        [u.name, u.email, passwordHash, u.role]
      );
      usersMap[u.name] = res.rows[0];

      // Alternate typo email (@gamil.com) so user can log in with either!
      if (u.alt) {
        await client.query(
          'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
          [u.name, u.alt, passwordHash, u.role]
        );
      }
    }

    console.log('✅ [Reset & Seed] Seeded users:', Object.keys(usersMap));

    // 5. Seed Realistic Luxury Auctions
    console.log('🏷️  [Reset & Seed] Creating curated luxury auctions...');
    const now = Date.now();
    const hours = (h) => new Date(now + h * 60 * 60 * 1000).toISOString();
    const pastHours = (h) => new Date(now - h * 60 * 60 * 1000).toISOString();

    const auctionsData = [
      {
        key: 'rolex',
        seller: usersMap['Test1'].id,
        title: '1968 Rolex Cosmograph Daytona "Paul Newman"',
        description: 'Reference 6239 featuring an authentic exotic tri-color step dial, Valjoux 722 manual-wind chronograph movement, and original riveted Oyster bracelet.',
        starting_price: 10000.00,
        current_price: 15000.00,
        end_time: hours(24),
        status: 'ACTIVE',
        winner_id: null,
        image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80',
        bids: [
          { bidder: usersMap['Test2'].id, amount: 12000.00, time: pastHours(3) },
          { bidder: usersMap['Test3'].id, amount: 15000.00, time: pastHours(1) },
        ]
      },
      {
        key: 'porsche',
        seller: usersMap['Test2'].id,
        title: '1993 Porsche 911 (964) Turbo 3.6',
        description: 'Rare Speed Yellow finish over black draped leather. Air-cooled 3.6-liter turbocharged flat-six producing 355 hp with matching 3-piece modular Speedline wheels.',
        starting_price: 85000.00,
        current_price: 95000.00,
        end_time: hours(48),
        status: 'ACTIVE',
        winner_id: null,
        image_url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80',
        bids: [
          { bidder: usersMap['Test1'].id, amount: 90000.00, time: pastHours(5) },
          { bidder: usersMap['Test4'].id, amount: 95000.00, time: pastHours(2) },
        ]
      },
      {
        key: 'jordan',
        seller: usersMap['Test3'].id,
        title: 'Air Jordan 1 High \'85 "Chicago" OG Vault',
        description: 'Deadstock museum-grade vintage original with authentic high-cut collar, premium full-grain leather, archival hangtag, and original 1985 shoe box.',
        starting_price: 2500.00,
        current_price: 3200.00,
        end_time: hours(8),
        status: 'ACTIVE',
        winner_id: null,
        image_url: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?w=800&q=80',
        bids: [
          { bidder: usersMap['Test1'].id, amount: 2800.00, time: pastHours(4) },
          { bidder: usersMap['Test2'].id, amount: 3200.00, time: pastHours(0.5) },
        ]
      },
      {
        key: 'sculpture',
        seller: usersMap['Test4'].id,
        title: 'Contemporary Cast Bronze "Loom in Motion"',
        description: 'Original lost-wax cast bronze sculpture with hand-applied verdigris and gold leaf patination. Signed, dated, and numbered 1 of 5 edition.',
        starting_price: 4000.00,
        current_price: 5000.00,
        end_time: hours(36),
        status: 'ACTIVE',
        winner_id: null,
        image_url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&q=80',
        bids: [
          { bidder: usersMap['Test3'].id, amount: 4500.00, time: pastHours(6) },
          { bidder: usersMap['Test1'].id, amount: 5000.00, time: pastHours(1.5) },
        ]
      },
      {
        key: 'leica',
        seller: usersMap['Test5'].id,
        title: '1954 Leica M6 Classic Rangefinder 35mm',
        description: 'Titanium special edition equipped with a matching Summicron-M 50mm f/2 lens. Fully CLA serviced with crystal optical rangefinder alignment.',
        starting_price: 1800.00,
        current_price: 2500.00,
        end_time: pastHours(2), // Ended!
        status: 'CLOSED',
        winner_id: usersMap['Test1'].id, // Test1 WON this auction!
        image_url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80',
        bids: [
          { bidder: usersMap['Test2'].id, amount: 2100.00, time: pastHours(8) },
          { bidder: usersMap['Test1'].id, amount: 2500.00, time: pastHours(3) },
        ]
      }
    ];

    for (const a of auctionsData) {
      const aucRes = await client.query(
        `INSERT INTO auctions 
          (seller_id, title, description, starting_price, current_price, end_time, status, winner_id, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          a.seller,
          a.title,
          a.description,
          a.starting_price,
          a.current_price,
          a.end_time,
          a.status,
          a.winner_id,
          a.image_url
        ]
      );
      const auctionId = aucRes.rows[0].id;

      // Insert bids for this auction
      for (const b of a.bids) {
        await client.query(
          'INSERT INTO bids (auction_id, bidder_id, amount, created_at) VALUES ($1, $2, $3, $4)',
          [auctionId, b.bidder, b.amount, b.time]
        );
      }
    }

    await client.query('COMMIT');
    console.log('🎉 [Reset & Seed] Database successfully reset and seeded with fresh test data!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  CREDENTIALS (All accounts use password: test@123)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  • Test1: test1@gmail.com  (or test1@gamil.com) - Name: Test1');
    console.log('  • Test2: test2@gmail.com  (or test2@gamil.com) - Name: Test2');
    console.log('  • Test3: test3@gmail.com  (or test3@gamil.com) - Name: Test3');
    console.log('  • Test4: test4@gmail.com  (or test4@gamil.com) - Name: Test4');
    console.log('  • Test5: test5@gmail.com  (or test5@gamil.com) - Name: Test5');
    console.log('  • Admin: admin@gmail.com  (or admin@gamil.com) - Name: Admin');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ [Reset & Seed] Error during reset and seed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

resetAndSeed();
