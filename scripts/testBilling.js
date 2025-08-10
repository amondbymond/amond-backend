const dotenv = require("dotenv");
const mysql = require("mysql2/promise");
const axios = require("axios");

dotenv.config();

async function testBilling() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "amond",
    port: process.env.DB_PORT || 3306,
  });

  try {
    console.log("\n=== Billing System Test ===\n");

    // 1. Check active subscriptions with upcoming billing
    console.log("1. Active Subscriptions Due for Billing:");
    const [dueBillings] = await connection.execute(`
      SELECT 
        ps.id,
        ps.fk_userId,
        ps.planType,
        ps.price,
        ps.nextBillingDate,
        ps.status,
        u.email,
        bk.billingKey,
        bk.cardNumber
      FROM payment_subscriptions ps
      LEFT JOIN billing_keys bk ON ps.fk_userId = bk.fk_userId AND bk.status = 'active'
      LEFT JOIN user u ON ps.fk_userId = u.id
      WHERE ps.status = 'active'
        AND ps.planType != 'basic'
      ORDER BY ps.nextBillingDate ASC
      LIMIT 10
    `);

    if (dueBillings.length === 0) {
      console.log("No active subscriptions found");
    } else {
      dueBillings.forEach(sub => {
        const billingDue = new Date(sub.nextBillingDate) <= new Date();
        console.log(`\nUser ID: ${sub.fk_userId} (${sub.email})`);
        console.log(`Plan: ${sub.planType} - ₩${sub.price}/month`);
        console.log(`Next Billing: ${sub.nextBillingDate} ${billingDue ? '⚠️ DUE NOW' : '✓'}`);
        console.log(`Billing Key: ${sub.billingKey ? '✓ Available' : '❌ Missing'}`);
        console.log(`Card: ${sub.cardNumber || 'N/A'}`);
      });
    }

    // 2. Check recent payment logs
    console.log("\n\n2. Recent Payment Logs (Last 5):");
    const [recentPayments] = await connection.execute(`
      SELECT 
        pl.orderNumber,
        pl.fk_userId,
        pl.price,
        pl.paymentStatus,
        pl.createdAt,
        u.email
      FROM payment_logs pl
      JOIN user u ON pl.fk_userId = u.id
      ORDER BY pl.createdAt DESC
      LIMIT 5
    `);

    if (recentPayments.length === 0) {
      console.log("No payment logs found");
    } else {
      recentPayments.forEach(payment => {
        const status = payment.paymentStatus === 'success' ? '✓' : '❌';
        console.log(`\n${payment.createdAt} - ${status} ${payment.paymentStatus}`);
        console.log(`Order: ${payment.orderNumber}`);
        console.log(`User: ${payment.email} (ID: ${payment.fk_userId})`);
        console.log(`Amount: ₩${payment.price}`);
      });
    }

    // 3. Check billing statistics
    console.log("\n\n3. Billing Statistics:");
    const [stats] = await connection.execute(`
      SELECT 
        COUNT(DISTINCT CASE WHEN ps.status = 'active' THEN ps.fk_userId END) as active_subscribers,
        COUNT(DISTINCT CASE WHEN ps.status = 'suspended' THEN ps.fk_userId END) as suspended_subscribers,
        COUNT(DISTINCT CASE WHEN ps.status = 'cancelled' THEN ps.fk_userId END) as cancelled_subscribers,
        COUNT(DISTINCT CASE WHEN pl.paymentStatus = 'success' AND pl.createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY) THEN pl.id END) as successful_payments_30d,
        COUNT(DISTINCT CASE WHEN pl.paymentStatus = 'failed' AND pl.createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY) THEN pl.id END) as failed_payments_30d,
        SUM(CASE WHEN pl.paymentStatus = 'success' AND pl.createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY) THEN pl.price ELSE 0 END) as revenue_30d
      FROM payment_subscriptions ps
      LEFT JOIN payment_logs pl ON ps.fk_userId = pl.fk_userId
    `);

    const stat = stats[0];
    console.log(`Active Subscribers: ${stat.active_subscribers}`);
    console.log(`Suspended: ${stat.suspended_subscribers}`);
    console.log(`Cancelled: ${stat.cancelled_subscribers}`);
    console.log(`\nLast 30 Days:`);
    console.log(`Successful Payments: ${stat.successful_payments_30d}`);
    console.log(`Failed Payments: ${stat.failed_payments_30d}`);
    console.log(`Total Revenue: ₩${(stat.revenue_30d || 0).toLocaleString()}`);

    // 4. Run manual billing test (optional)
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('\n\nDo you want to trigger a manual billing test? (y/n): ', async (answer) => {
      if (answer.toLowerCase() === 'y') {
        console.log("\nTriggering manual billing test...");
        
        try {
          // You need to login as admin first to get the session token
          console.log("Note: You need to be logged in as admin to trigger billing test");
          console.log("Use the admin account: admin@mond.io.kr");
          
          // This would need actual session token from admin login
          // const response = await axios.post('http://localhost:9988/payment/test-billing', {}, {
          //   headers: {
          //     'Cookie': 'connect.sid=YOUR_ADMIN_SESSION_ID'
          //   }
          // });
          
          console.log("\nTo trigger billing test:");
          console.log("1. Login as admin at http://localhost:3000/login");
          console.log("2. Open browser console and run:");
          console.log("   fetch('http://localhost:9988/payment/test-billing', {");
          console.log("     method: 'POST',");
          console.log("     credentials: 'include'");
          console.log("   }).then(r => r.json()).then(console.log)");
          
        } catch (error) {
          console.error("Failed to trigger billing test:", error.message);
        }
      }
      
      readline.close();
      await connection.end();
    });

  } catch (error) {
    console.error("Error:", error);
    await connection.end();
  }
}

testBilling();