const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config();

async function runBillingNow() {
  console.log("\n=== Running Billing Test NOW ===\n");
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "amond",
    port: process.env.DB_PORT || 3306,
  });

  try {
    // Set environment for test mode
    process.env.BILLING_TEST_MODE = "true";
    
    // Find active subscriptions
    const [subs] = await connection.execute(`
      SELECT ps.*, u.email, u.name, bk.billingKey 
      FROM payment_subscriptions ps
      JOIN user u ON ps.fk_userId = u.id
      LEFT JOIN billing_keys bk ON ps.fk_userId = bk.fk_userId AND bk.status = 'active'
      WHERE ps.status = 'active' 
        AND ps.planType != 'basic'
        AND bk.billingKey IS NOT NULL
    `);
    
    console.log(`Found ${subs.length} active subscriptions with billing keys\n`);
    
    if (subs.length > 0) {
      // Update first subscription to be due now
      await connection.execute(
        "UPDATE payment_subscriptions SET nextBillingDate = NOW() WHERE id = ?",
        [subs[0].id]
      );
      
      console.log(`Set subscription ${subs[0].id} for user ${subs[0].fk_userId} to bill NOW`);
      console.log(`Email: ${subs[0].email || 'null'}`);
      console.log(`Plan: ${subs[0].planType}`);
      console.log(`Billing Key: ${subs[0].billingKey}\n`);
      
      // Import and run billing
      console.log("Running billing process...\n");
      const { processMonthlyBilling } = require("../services/billingService");
      await processMonthlyBilling();
      
      // Check payment logs
      const [logs] = await connection.execute(`
        SELECT * FROM payment_logs 
        WHERE fk_userId = ? 
        ORDER BY createdAt DESC 
        LIMIT 1
      `, [subs[0].fk_userId]);
      
      if (logs.length > 0) {
        console.log("\nLatest payment log:");
        console.log(`Status: ${logs[0].paymentStatus}`);
        console.log(`Order: ${logs[0].orderNumber}`);
        console.log(`Amount: ₩${logs[0].price}`);
        console.log(`Time: ${logs[0].createdAt}`);
        
        if (logs[0].inicisResponse) {
          try {
            const response = JSON.parse(logs[0].inicisResponse);
            console.log(`Response Code: ${response.resultCode || response.error}`);
            console.log(`Message: ${response.resultMsg || response.message || 'N/A'}`);
          } catch (e) {
            console.log(`Response: ${logs[0].inicisResponse}`);
          }
        }
      }
    }
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await connection.end();
  }
}

runBillingNow();