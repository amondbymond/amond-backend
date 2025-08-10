const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config();

async function checkSubscriptions() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "amond",
    port: process.env.DB_PORT || 3306,
  });

  try {
    // Check payment_subscriptions table structure
    console.log("\n=== Payment Subscriptions Table Structure ===");
    const [columns] = await connection.execute(
      `SHOW COLUMNS FROM payment_subscriptions`
    );
    console.log("Columns:", columns.map(col => col.Field).join(", "));

    // Get active subscriptions
    console.log("\n=== Active Subscriptions ===");
    const [subscriptions] = await connection.execute(
      `SELECT 
        ps.*, 
        u.email,
        u.grade
      FROM payment_subscriptions ps
      JOIN user u ON ps.fk_userId = u.id
      WHERE ps.status = 'active'
      ORDER BY ps.startDate DESC
      LIMIT 10`
    );
    
    console.log(`Found ${subscriptions.length} active subscriptions`);
    subscriptions.forEach(sub => {
      console.log(`\nUser ID: ${sub.fk_userId}`);
      console.log(`Plan: ${sub.planType}`);
      console.log(`Price: ₩${sub.price}/month`);
      console.log(`Status: ${sub.status}`);
      console.log(`Start Date: ${sub.startDate}`);
      console.log(`Next Billing: ${sub.nextBillingDate}`);
      console.log(`User Grade: ${sub.grade}`);
    });

    // Count by plan type
    console.log("\n=== Subscription Summary ===");
    const [summary] = await connection.execute(
      `SELECT 
        planType,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count
      FROM payment_subscriptions
      GROUP BY planType`
    );
    
    summary.forEach(row => {
      console.log(`${row.planType}: ${row.active_count} active (${row.count} total)`);
    });
    
  } catch (error) {
    console.error("Error checking subscriptions:", error);
  } finally {
    await connection.end();
  }
}

checkSubscriptions();