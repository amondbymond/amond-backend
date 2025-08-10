const axios = require("axios");

async function triggerBilling() {
  try {
    console.log("\n=== Triggering Manual Billing Test ===\n");
    
    // First, let's check if the backend is running
    try {
      await axios.get("http://localhost:9988/auth/loginCheck");
      console.log("✓ Backend server is running");
    } catch (e) {
      console.error("❌ Backend server is not running!");
      console.error("Please start the backend with: npm run start");
      return;
    }

    // Import and run the billing service directly
    console.log("\nRunning billing process directly...\n");
    
    // We need to run this in the backend context
    const { processMonthlyBilling, processExpiredMemberships } = require("../services/billingService");
    
    await processMonthlyBilling();
    await processExpiredMemberships();
    
    console.log("\n✓ Billing process completed");
    console.log("\nCheck the backend server logs for detailed billing information");
    
  } catch (error) {
    console.error("Error:", error.message);
  }
}

triggerBilling();