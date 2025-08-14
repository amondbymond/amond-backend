const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

async function monitorPayment() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'amond',
    port: process.env.DB_PORT || 3306,
  });

  try {
    console.log('\n=== Payment Monitoring Script ===\n');
    
    // Check latest billing keys
    const [latestKeys] = await connection.execute(`
      SELECT * FROM billing_keys 
      ORDER BY id DESC 
      LIMIT 3
    `);
    
    console.log('Latest Billing Keys:');
    latestKeys.forEach(key => {
      const keyType = key.billingKey.startsWith('StdpayCARD') ? 'StdPay (One-time)' : 'BILLAUTH (Recurring)';
      const isNew = new Date(key.createdAt) > new Date(Date.now() - 10 * 60 * 1000) ? ' [NEW!]' : '';
      console.log(`- ${key.billingKey.substring(0, 40)}... - ${keyType}${isNew}`);
      console.log(`  User: ${key.fk_userId}, Status: ${key.status}, Created: ${key.createdAt}`);
    });
    
    // Check latest payments
    const [latestPayments] = await connection.execute(`
      SELECT * FROM payment_logs 
      ORDER BY id DESC 
      LIMIT 3
    `);
    
    console.log('\nLatest Payment Logs:');
    latestPayments.forEach(payment => {
      console.log(`- Order: ${payment.orderNumber}`);
      console.log(`  Status: ${payment.paymentStatus}, Amount: ${payment.price} KRW`);
      console.log(`  Time: ${payment.createdAt}`);
    });
    
    // Check subscription status
    const [subscriptions] = await connection.execute(`
      SELECT ps.*, u.email, bk.billingKey
      FROM payment_subscriptions ps
      JOIN user u ON ps.fk_userId = u.id
      LEFT JOIN billing_keys bk ON ps.fk_userId = bk.fk_userId AND bk.status = 'active'
      WHERE ps.status = 'active'
      ORDER BY ps.id DESC
      LIMIT 3
    `);
    
    console.log('\nActive Subscriptions:');
    subscriptions.forEach(sub => {
      const keyType = sub.billingKey ? 
        (sub.billingKey.startsWith('StdpayCARD') ? 'StdPay' : 'BILLAUTH') : 
        'No key';
      console.log(`- User ${sub.fk_userId}: ${sub.planType} plan`);
      console.log(`  Next billing: ${sub.nextBillingDate}`);
      console.log(`  Billing key type: ${keyType}`);
      console.log(`  Can recur: ${keyType === 'BILLAUTH' ? '✅ YES' : '❌ NO'}`);
    });
    
    // Test recurring billing
    console.log('\n=== Recurring Billing Test ===');
    
    if (subscriptions.length > 0 && subscriptions[0].billingKey) {
      const testSub = subscriptions[0];
      if (testSub.billingKey.startsWith('StdpayCARD')) {
        console.log('\n❌ Cannot test recurring billing - StdPay key detected');
        console.log('This key type will fail with "[1195][빌링 미등록 거래]" error');
        console.log('\nTo enable recurring billing:');
        console.log('1. User must register card using BILLAUTH process');
        console.log('2. Visit: /payment/billing-register');
        console.log('3. Complete registration with acceptmethod="BILLAUTH(Card)"');
      } else {
        console.log('\n✅ BILLAUTH key detected - recurring billing should work!');
        console.log('\nTo test recurring payment now:');
        console.log('1. Update billing date: UPDATE payment_subscriptions SET nextBillingDate = NOW() WHERE id = ' + testSub.id);
        console.log('2. Run billing: npx ts-node -e "import { runBillingNow } from \'./jobs/billingCron\'; runBillingNow();"');
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await connection.end();
  }
}

// Run monitoring
monitorPayment();