const dotenv = require('dotenv');
dotenv.config();

// Set mock billing mode
process.env.USE_MOCK_BILLING = 'true';

// Import the mock billing service
const { processMockMonthlyBilling, processExpiredMemberships } = require('../services/mockBillingService');

async function testMockBilling() {
  console.log('\n=== TESTING MOCK BILLING SYSTEM ===\n');
  console.log('Mock billing mode:', process.env.USE_MOCK_BILLING);
  
  try {
    console.log('Running mock monthly billing...');
    await processMockMonthlyBilling();
    
    console.log('\nChecking for expired memberships...');
    await processExpiredMemberships();
    
    console.log('\n✅ Mock billing test completed!');
  } catch (error) {
    console.error('❌ Mock billing test failed:', error);
  }
  
  // Exit after test
  process.exit(0);
}

// Run the test
testMockBilling();