const pool = require('../src/db');

async function seedPayouts() {
  console.log('Seeding sample payout coordinates for test accounts...');

  const samplePayouts = {
    'test1@gmail.com': {
      bank_name: 'JPMorgan Chase Wealth',
      account_number: '9841289104',
      ifsc_swift: 'CHASUS33',
      upi_id: 'test1@apl',
      paypal_email: 'test1@gmail.com',
      notes: 'Please quote AuctionLoom lot ID in transfer reference.'
    },
    'test2@gmail.com': {
      bank_name: 'HSBC Premier Private',
      account_number: '4820193481',
      ifsc_swift: 'HSBC0001',
      upi_id: 'test2@axisbank',
      paypal_email: 'test2@paypal.com',
      notes: 'Wire confirmations processed within 2 hours.'
    },
    'test3@gmail.com': {
      bank_name: 'Barclays Private Clients',
      account_number: '7712398410',
      ifsc_swift: 'BARC0003',
      upi_id: 'test3@icici',
      paypal_email: 'test3@paypal.com',
      notes: 'Express insured courier dispatched immediately upon payment.'
    },
    'test4@gmail.com': {
      bank_name: 'Citibank NA Global',
      account_number: '5519827361',
      ifsc_swift: 'CITI0004',
      upi_id: 'test4@paytm',
      paypal_email: 'test4@gmail.com',
      notes: 'Direct escrow clearance.'
    },
    'test5@gmail.com': {
      bank_name: 'Standard Chartered Private Bank',
      account_number: '04298172910',
      ifsc_swift: 'SCBL00021',
      upi_id: 'test5@okhdfcbank',
      paypal_email: 'test5@paypal.me',
      notes: 'Leica Leica CLA certificate and tracking number will be provided upon wire receipt.'
    }
  };

  for (const [email, methods] of Object.entries(samplePayouts)) {
    const alt = email.replace('@gmail.com', '@gamil.com');
    await pool.query(
      `UPDATE users 
       SET payout_methods = $1 
       WHERE email = $2 OR email = $3`,
      [JSON.stringify(methods), email, alt]
    );
    console.log(`Updated payout coordinates for ${email}`);
  }

  console.log('All sample payout coordinates seeded successfully.');
  process.exit(0);
}

seedPayouts().catch((err) => {
  console.error(err);
  process.exit(1);
});
