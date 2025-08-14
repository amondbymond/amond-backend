const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config();

async function watchNewPurchase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "amond",
    port: process.env.DB_PORT || 3306,
  });

  console.log("\n🔍 WATCHING FOR NEW PURCHASES...\n");
  console.log("Please make a new subscription purchase in the frontend.");
  console.log("I'll detect it and test recurring billing immediately.\n");

  let lastBillingKeyId = 0;
  let lastSubscriptionId = 0;

  // Get current max IDs
  const [currentKeys] = await connection.execute("SELECT MAX(id) as maxId FROM billing_keys");
  const [currentSubs] = await connection.execute("SELECT MAX(id) as maxId FROM payment_subscriptions");
  
  lastBillingKeyId = currentKeys[0].maxId || 0;
  lastSubscriptionId = currentSubs[0].maxId || 0;

  const checkForNewPurchase = async () => {
    try {
      // Check for new billing keys
      const [newKeys] = await connection.execute(`
        SELECT bk.*, u.email, u.name 
        FROM billing_keys bk
        JOIN user u ON bk.fk_userId = u.id
        WHERE bk.id > ?
        ORDER BY bk.id DESC
      `, [lastBillingKeyId]);

      if (newKeys.length > 0) {
        console.log("\n🎉 NEW BILLING KEY DETECTED!");
        const newKey = newKeys[0];
        lastBillingKeyId = newKey.id;
        
        console.log(`\nUser: ${newKey.name || newKey.email || 'User ' + newKey.fk_userId}`);
        console.log(`Billing Key: ${newKey.billingKey}`);
        console.log(`Card: ${newKey.cardNumber} (${newKey.cardName})`);
        console.log(`Created: ${newKey.createdAt}`);

        // Check for corresponding subscription
        const [newSubs] = await connection.execute(`
          SELECT * FROM payment_subscriptions 
          WHERE fk_userId = ? AND id > ?
          ORDER BY id DESC LIMIT 1
        `, [newKey.fk_userId, lastSubscriptionId]);

        if (newSubs.length > 0) {
          const sub = newSubs[0];
          lastSubscriptionId = sub.id;
          
          console.log(`\n📋 NEW SUBSCRIPTION:`);
          console.log(`Plan: ${sub.planType} - ₩${sub.price}/month`);
          console.log(`Status: ${sub.status}`);
          console.log(`Next Billing: ${sub.nextBillingDate}`);

          console.log("\n⚡ TRIGGERING IMMEDIATE BILLING TEST...");
          
          // Set billing to NOW
          await connection.execute(
            "UPDATE payment_subscriptions SET nextBillingDate = NOW() WHERE id = ?",
            [sub.id]
          );

          console.log("\n✅ Subscription set to bill NOW!");
          console.log("The billing cron will process it within 60 seconds.");
          console.log("\nMonitoring payment results...");

          // Start monitoring payment logs
          setTimeout(() => monitorPaymentResults(newKey.fk_userId), 5000);
        }
      }

      // Check for new subscriptions without billing keys (shouldn't happen)
      const [newSubsOnly] = await connection.execute(`
        SELECT ps.*, u.email, u.name 
        FROM payment_subscriptions ps
        JOIN user u ON ps.fk_userId = u.id
        WHERE ps.id > ?
        ORDER BY ps.id DESC
      `, [lastSubscriptionId]);

      if (newSubsOnly.length > 0 && newKeys.length === 0) {
        const sub = newSubsOnly[0];
        lastSubscriptionId = sub.id;
        console.log(`\n⚠️  New subscription without billing key: User ${sub.fk_userId} - ${sub.planType}`);
      }

    } catch (error) {
      console.error("Check error:", error.message);
    }
  };

  const monitorPaymentResults = async (userId) => {
    console.log(`\n📊 Monitoring payment results for user ${userId}...`);
    
    let attempts = 0;
    const maxAttempts = 12; // Check for 2 minutes

    const checkPayment = setInterval(async () => {
      attempts++;
      
      const [logs] = await connection.execute(`
        SELECT * FROM payment_logs 
        WHERE fk_userId = ? 
          AND createdAt > DATE_SUB(NOW(), INTERVAL 3 MINUTE)
        ORDER BY createdAt DESC 
        LIMIT 1
      `, [userId]);

      if (logs.length > 0) {
        const log = logs[0];
        console.log(`\n🔔 PAYMENT PROCESSED!`);
        console.log(`Status: ${log.paymentStatus === 'success' ? '✅ SUCCESS' : '❌ FAILED'}`);
        console.log(`Order: ${log.orderNumber}`);
        console.log(`Amount: ₩${log.price}`);
        
        if (log.inicisResponse) {
          try {
            const response = typeof log.inicisResponse === 'string' 
              ? JSON.parse(log.inicisResponse) 
              : log.inicisResponse;
            console.log(`Result: [${response.resultCode}] ${response.resultMsg || 'Payment processed'}`);
            
            if (log.paymentStatus === 'success') {
              console.log(`\n🎉 RECURRING BILLING TEST SUCCESSFUL!`);
              console.log(`The billing system is working correctly.`);
              
              // Check next billing date
              const [nextBilling] = await connection.execute(`
                SELECT nextBillingDate FROM payment_subscriptions 
                WHERE fk_userId = ? 
                ORDER BY id DESC LIMIT 1
              `, [userId]);
              
              if (nextBilling.length > 0) {
                console.log(`\nNext billing scheduled: ${nextBilling[0].nextBillingDate}`);
              }
            }
          } catch (e) {
            console.log(`Response: ${JSON.stringify(log.inicisResponse)}`);
          }
        }
        
        clearInterval(checkPayment);
        console.log("\n✅ Test complete. Press Ctrl+C to exit.");
      } else if (attempts >= maxAttempts) {
        console.log("\n⏱️  No payment processed yet after 2 minutes.");
        console.log("Check the backend logs for any errors.");
        clearInterval(checkPayment);
      } else {
        process.stdout.write(`\r⏳ Waiting for payment... (${attempts * 10}s)`);
      }
    }, 10000);
  };

  // Initial check
  await checkForNewPurchase();
  
  // Check every 5 seconds
  const interval = setInterval(checkForNewPurchase, 5000);

  // Handle cleanup
  process.on('SIGINT', async () => {
    console.log("\n\nStopping watcher...");
    clearInterval(interval);
    await connection.end();
    process.exit(0);
  });
}

watchNewPurchase();