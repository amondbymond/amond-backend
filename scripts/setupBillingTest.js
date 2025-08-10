const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config();

async function setupBillingTest() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "amond",
    port: process.env.DB_PORT || 3306,
  });

  try {
    console.log("\n=== Setting up Billing Test ===\n");

    // Find a user with active subscription and billing key
    const [users] = await connection.execute(`
      SELECT 
        ps.id as subscriptionId,
        ps.fk_userId,
        ps.planType,
        ps.nextBillingDate,
        u.email,
        bk.billingKey
      FROM payment_subscriptions ps
      JOIN billing_keys bk ON ps.fk_userId = bk.fk_userId AND bk.status = 'active'
      JOIN user u ON ps.fk_userId = u.id
      WHERE ps.status = 'active'
        AND ps.planType != 'basic'
      LIMIT 1
    `);

    if (users.length === 0) {
      console.log("No active subscriptions with billing keys found!");
      console.log("\nYou need to:");
      console.log("1. Have a user with an active pro/business/premium subscription");
      console.log("2. Have a valid billing key saved for that user");
      return;
    }

    const user = users[0];
    console.log(`Found subscription for user ${user.fk_userId} (${user.email})`);
    console.log(`Current next billing date: ${user.nextBillingDate}`);
    
    // Update the subscription to be due for billing NOW
    const [result] = await connection.execute(`
      UPDATE payment_subscriptions 
      SET nextBillingDate = NOW()
      WHERE id = ?
    `, [user.subscriptionId]);

    console.log(`\n✓ Updated subscription to be due for billing NOW`);
    console.log(`\nThe billing cron job will process this in the next run (every minute in test mode)`);
    console.log(`\nWatch the server logs for:`);
    console.log(`- "[Billing] Starting monthly billing process..."`);
    console.log(`- "[Billing] Processing payment for user ${user.fk_userId}..."`);
    console.log(`- Success or failure messages`);
    
    // Check current billing cron schedule
    console.log(`\nBilling cron is running every minute in test mode`);
    console.log(`You can also trigger it manually by calling the /payment/test-billing endpoint as admin`);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await connection.end();
  }
}

setupBillingTest();