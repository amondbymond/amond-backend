const axios = require('axios');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

async function testDirectBilling() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'amond',
    port: process.env.DB_PORT || 3306,
  });

  try {
    console.log('\n=== INICIS Direct Billing Test ===\n');
    
    // Step 1: Check current billing keys
    console.log('--- Step 1: Check Current Billing Keys ---');
    
    const [billingKeys] = await connection.execute(`
      SELECT 
        bk.*,
        u.email,
        ps.planType,
        ps.nextBillingDate
      FROM billing_keys bk
      JOIN user u ON bk.fk_userId = u.id
      LEFT JOIN payment_subscriptions ps ON bk.fk_userId = ps.fk_userId AND ps.status = 'active'
      WHERE bk.status = 'active'
      ORDER BY bk.id DESC
      LIMIT 5
    `);
    
    console.log(`\nFound ${billingKeys.length} active billing keys:\n`);
    
    billingKeys.forEach(key => {
      const keyType = key.billingKey.startsWith('StdpayCARD') ? 'StdPay (One-time)' : 'BILLAUTH (Recurring)';
      console.log(`User ${key.fk_userId}:`);
      console.log(`  - Billing Key: ${key.billingKey.substring(0, 30)}...`);
      console.log(`  - Type: ${keyType}`);
      console.log(`  - Email: ${key.email}`);
      console.log(`  - Plan: ${key.planType || 'None'}`);
      console.log(`  - Next Billing: ${key.nextBillingDate || 'N/A'}`);
      console.log('');
    });
    
    // Step 2: Identify problematic keys
    const stdPayKeys = billingKeys.filter(key => key.billingKey.startsWith('StdpayCARD'));
    
    if (stdPayKeys.length > 0) {
      console.log(`\n⚠️  WARNING: Found ${stdPayKeys.length} StdPay billing keys that cannot be used for recurring payments!`);
      console.log('These users need to re-register their cards using the BILLAUTH process.\n');
    }
    
    // Step 3: Test direct billing with a proper key
    const properKeys = billingKeys.filter(key => !key.billingKey.startsWith('StdpayCARD'));
    
    if (properKeys.length > 0) {
      console.log('\n--- Step 2: Test Direct Billing ---');
      console.log('\nWould process billing for:');
      properKeys.forEach(key => {
        console.log(`- User ${key.fk_userId} with plan ${key.planType}`);
      });
    } else {
      console.log('\n❌ No proper BILLAUTH billing keys found!');
      console.log('\nTo set up recurring payments:');
      console.log('1. User needs to visit /payment/billing-register');
      console.log('2. Complete card registration with INICIS BILLAUTH');
      console.log('3. The system will automatically create proper billing keys');
    }
    
    // Step 4: Show how to enable direct billing
    console.log('\n--- Step 3: Enable Direct Billing ---');
    console.log('\nTo switch from mock to direct billing:');
    console.log('1. Set USE_MOCK_BILLING=false in .env');
    console.log('2. Set USE_DIRECT_BILLING=true in .env');
    console.log('3. Restart the server');
    console.log('\nCurrent settings:');
    console.log(`- USE_MOCK_BILLING: ${process.env.USE_MOCK_BILLING}`);
    console.log(`- USE_DIRECT_BILLING: ${process.env.USE_DIRECT_BILLING}`);
    console.log(`- BILLING_TEST_MODE: ${process.env.BILLING_TEST_MODE}`);
    
    // Step 5: Manual billing test
    console.log('\n--- Step 4: Manual Billing Test ---');
    console.log('\nTo manually test billing, run:');
    console.log('npx ts-node -e "import { runBillingNow } from \'./jobs/billingCron\'; runBillingNow();"');
    
  } catch (error) {
    console.error('\nTest Error:', error.message);
  } finally {
    await connection.end();
  }
}

// Run the test
testDirectBilling();