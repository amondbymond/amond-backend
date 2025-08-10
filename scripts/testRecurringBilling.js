const axios = require("axios");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config();

async function getAdminSession() {
  // Login as test user
  const loginResponse = await axios.post("http://localhost:9988/auth/login/email", {
    email: "test1@test1.com",
    pass: "December9)"
  }, {
    withCredentials: true,
    headers: { "Content-Type": "application/json" }
  });
  
  return loginResponse.headers["set-cookie"];
}

async function testRecurringBilling() {
  console.log("\n=== Testing Recurring Billing ===\n");
  
  try {
    // Get admin session
    console.log("Logging in as admin...");
    const cookies = await getAdminSession();
    
    // First billing
    console.log("\nRunning FIRST billing cycle...");
    console.log("================================");
    
    const response1 = await axios.post("http://localhost:9988/payment/test-billing", {}, {
      headers: {
        "Cookie": cookies ? cookies.join("; ") : ""
      }
    });
    
    console.log("First billing response:", response1.data);
    
    console.log("\nWaiting 60 seconds before second billing...");
    
    // Wait 60 seconds
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    // Second billing
    console.log("\nRunning SECOND billing cycle...");
    console.log("================================");
    
    const response2 = await axios.post("http://localhost:9988/payment/test-billing", {}, {
      headers: {
        "Cookie": cookies ? cookies.join("; ") : ""
      }
    });
    
    console.log("Second billing response:", response2.data);
    
    // Check payment logs
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "amond",
      port: process.env.DB_PORT || 3306,
    });
    
    const [logs] = await connection.execute(`
      SELECT orderNumber, price, paymentStatus, createdAt 
      FROM payment_logs 
      ORDER BY createdAt DESC 
      LIMIT 5
    `);
    
    console.log("\n✓ Recent Payment Logs:");
    console.log("=======================");
    logs.forEach(log => {
      const status = log.paymentStatus === 'success' ? '✓' : '❌';
      console.log(`${status} ${log.createdAt} - Order: ${log.orderNumber} - ₩${log.price}`);
    });
    
    await connection.end();
    
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
  }
}

// Run the test
testRecurringBilling();