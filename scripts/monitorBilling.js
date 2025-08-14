const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config();

async function monitorBilling() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "amond",
    port: process.env.DB_PORT || 3306,
  });

  console.log("\n📊 BILLING MONITOR - Checking every 10 seconds...\n");
  console.log("Press Ctrl+C to stop\n");

  let lastLogId = 0;

  const checkLogs = async () => {
    try {
      // Get new payment logs
      const [logs] = await connection.execute(`
        SELECT 
          pl.*,
          u.name,
          u.email
        FROM payment_logs pl
        JOIN user u ON pl.fk_userId = u.id
        WHERE pl.id > ?
        ORDER BY pl.id DESC
        LIMIT 10
      `, [lastLogId]);

      if (logs.length > 0) {
        console.log(`\n🔔 NEW PAYMENT ACTIVITY (${new Date().toLocaleTimeString()}):`);
        console.log("=" .repeat(60));
        
        logs.reverse().forEach(log => {
          const status = log.paymentStatus === 'success' ? '✅ SUCCESS' : '❌ FAILED';
          console.log(`\n${status} - User ${log.fk_userId} (${log.name || log.email || 'Unknown'})`);
          console.log(`Order: ${log.orderNumber}`);
          console.log(`Amount: ₩${log.price.toLocaleString()}`);
          console.log(`Time: ${log.createdAt}`);
          
          if (log.inicisResponse) {
            try {
              const response = typeof log.inicisResponse === 'string' 
                ? JSON.parse(log.inicisResponse) 
                : log.inicisResponse;
              console.log(`Result: [${response.resultCode}] ${response.resultMsg || 'No message'}`);
              if (response.tid) console.log(`TID: ${response.tid}`);
            } catch (e) {
              console.log(`Response: ${JSON.stringify(log.inicisResponse).substring(0, 100)}...`);
            }
          }
          
          lastLogId = Math.max(lastLogId, log.id);
        });
        
        console.log("\n" + "=" .repeat(60));
      }
      
      // Check subscription status
      const [subs] = await connection.execute(`
        SELECT 
          ps.fk_userId,
          ps.planType,
          ps.status,
          ps.nextBillingDate,
          TIMESTAMPDIFF(SECOND, NOW(), ps.nextBillingDate) as secondsUntilBilling
        FROM payment_subscriptions ps
        JOIN billing_keys bk ON ps.fk_userId = bk.fk_userId AND bk.status = 'active'
        WHERE ps.status = 'active' AND ps.planType != 'basic'
        ORDER BY ps.nextBillingDate ASC
      `);
      
      if (subs.length > 0) {
        process.stdout.write(`\r⏱️  Next billing: `);
        subs.forEach((sub, i) => {
          const seconds = sub.secondsUntilBilling;
          if (seconds <= 0) {
            process.stdout.write(`User ${sub.fk_userId} (DUE NOW) `);
          } else {
            process.stdout.write(`User ${sub.fk_userId} (${seconds}s) `);
          }
          if (i < subs.length - 1) process.stdout.write("| ");
        });
      }
      
    } catch (error) {
      console.error("\nMonitor error:", error.message);
    }
  };

  // Initial check
  await checkLogs();
  
  // Check every 10 seconds
  const interval = setInterval(checkLogs, 10000);

  // Handle cleanup
  process.on('SIGINT', async () => {
    console.log("\n\nStopping monitor...");
    clearInterval(interval);
    await connection.end();
    process.exit(0);
  });
}

monitorBilling();