const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config();

async function testUserBilling() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "amond",
    port: process.env.DB_PORT || 3306,
  });

  try {
    console.log("\n=== Setting Up Billing Test for test1@test1.com ===\n");

    // Find the user and their subscription
    const [users] = await connection.execute(`
      SELECT 
        u.id,
        u.email,
        ps.id as subscriptionId,
        ps.planType,
        ps.nextBillingDate,
        ps.status as subscriptionStatus,
        bk.billingKey,
        bk.cardNumber
      FROM user u
      JOIN payment_subscriptions ps ON u.id = ps.fk_userId
      LEFT JOIN billing_keys bk ON u.id = bk.fk_userId AND bk.status = 'active'
      WHERE u.email = 'eGhXaD