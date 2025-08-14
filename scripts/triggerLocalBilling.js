const axios = require("axios");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config();

async function triggerLocalBilling() {
  console.log("\n=== Triggering Local Billing Test ===\n");
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "amond",
    port: process.env.DB_PORT || 3306,
  });

  try {
    // Use user ID 27 (currently logged in user)
    const userId = 27;
    console.log(`Using user ID: ${userId}`);
    
    // Check if user has active subscription with billing key
    const [subs] = await connection.execute(`
      SELECT ps.*, bk.billingKey, bk.cardNumber 
      FROM payment_subscriptions ps
      LEFT JOIN billing_keys bk ON ps.fk_userId = bk.fk_userId AND bk.status = 'active'
      WHERE ps.fk_userId = ? AND ps.status = 'active'
    `, [userId]);
    
    if (subs.length === 0) {
      console.log("No active subscription found for this user");
      return;
    }
    
    const subscription = subs[0];
    console.log(`\nActive Subscription:`);
    console.log(`- Plan: ${subscription.planType}`);
    console.log(`- Price: ₩${subscription.price}`);
    console.log(`- Next Billing: ${subscription.nextBillingDate}`);
    console.log(`- Billing Key: ${subscription.billingKey ? '✓' : '❌ Missing'}`);
    
    if (!subscription.billingKey) {
      console.log("\n❌ No billing key found. Cannot process recurring payment.");
      return;
    }
    
    // Update subscription to be due now
    await connection.execute(
      "UPDATE payment_subscriptions SET nextBillingDate = NOW() WHERE id = ?",
      [subscription.id]
    );
    
    console.log("\n✓ Set subscription to bill NOW");
    console.log("\nThe billing cron job will process this in the next minute...");
    console.log("Watch the backend logs for:");
    console.log("- [Billing] Starting monthly billing process...");
    console.log("- [Billing] Processing payment for user...");
    console.log("- Success or failure messages");
    
    // Login as admin to trigger manual billing
    console.log("\nAlternatively, logging in as admin to trigger manual billing...");
    
    try {
      const loginResponse = await axios.post("http://localhost:9988/auth/login/email", {
        email: "admin@mond.io.kr",
        pass: "dkahsem123@"
      }, {
        headers: { "Content-Type": "application/json" }
      });
      
      const cookies = loginResponse.headers["set-cookie"];
      
      // Trigger test billing
      const billingResponse = await axios.post("http://localhost:9988/payment/test-billing", 
        { userId: userId },
        {
          headers: {
            "Cookie": cookies ? cookies.join("; ") : "",
            "Content-Type": "application/json"
          }
        }
      );
      
      console.log("\n✓ Manual billing triggered:", billingResponse.data.message);
      
    } catch (error) {
      console.log("\n⚠️  Could not trigger manual billing (admin login required)");
      console.log("Waiting for automatic cron job instead...");
    }
    
    // Wait a bit and check payment logs
    console.log("\nWaiting 5 seconds to check results...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const [logs] = await connection.execute(`
      SELECT * FROM payment_logs 
      WHERE fk_userId = ? 
      ORDER BY createdAt DESC 
      LIMIT 3
    `, [userId]);
    
    console.log(`\n=== Recent Payment Logs for User ${userId} ===`);
    logs.forEach((log, i) => {
      console.log(`\nLog ${i + 1}:`);
      console.log(`- Order: ${log.orderNumber}`);
      console.log(`- Status: ${log.paymentStatus === 'success' ? '✓ SUCCESS' : '❌ FAILED'}`);
      console.log(`- Amount: ₩${log.price}`);
      console.log(`- Time: ${log.createdAt}`);
      
      if (log.inicisResponse) {
        try {
          const response = JSON.parse(log.inicisResponse);
          console.log(`- Response Code: ${response.resultCode || response.error || 'N/A'}`);
          console.log(`- Message: ${response.resultMsg || response.message || 'N/A'}`);
        } catch (e) {
          console.log(`- Response: ${JSON.stringify(log.inicisResponse).substring(0, 200)}...`);
        }
      }
    });
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await connection.end();
  }
}

triggerLocalBilling();