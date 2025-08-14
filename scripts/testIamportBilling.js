const axios = require('axios');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// Iamport Test Configuration
const IAMPORT_CONFIG = {
  apiKey: "3170176238757586", // Test API Key
  apiSecret: "6e3ae0d4bd08a75cdaa659f99b5ca68e4e1b2e39e1e37f5fc17b5ac8e97e088a7f4c77f0d4de1eb6", // Test API Secret
  apiUrl: "https://api.iamport.kr"
};

async function getAccessToken() {
  try {
    const response = await axios.post(`${IAMPORT_CONFIG.apiUrl}/users/getToken`, {
      imp_key: IAMPORT_CONFIG.apiKey,
      imp_secret: IAMPORT_CONFIG.apiSecret
    });

    if (response.data.code === 0) {
      return response.data.response.access_token;
    } else {
      throw new Error(`Failed to get access token: ${response.data.message}`);
    }
  } catch (error) {
    console.error("Error getting access token:", error.response?.data || error.message);
    throw error;
  }
}

async function testIamportBilling() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'amond',
    port: process.env.DB_PORT || 3306,
  });

  try {
    console.log('\n=== TESTING IAMPORT BILLING API ===\n');

    // Get access token
    console.log('1. Getting Iamport access token...');
    const accessToken = await getAccessToken();
    console.log('✅ Access token obtained');

    // Get the latest billing key for user 27
    const [billingKeys] = await connection.execute(`
      SELECT bk.*, u.email, u.name 
      FROM billing_keys bk
      JOIN user u ON bk.fk_userId = u.id
      WHERE bk.fk_userId = 27 AND bk.status = 'active'
      ORDER BY bk.id DESC
      LIMIT 1
    `);

    if (billingKeys.length === 0) {
      console.log('No active billing key found for user 27');
      return;
    }

    const billingKeyData = billingKeys[0];
    console.log('\n2. Billing Key Info:');
    console.log('Billing Key:', billingKeyData.billingKey);
    console.log('Card:', billingKeyData.cardNumber, '(' + billingKeyData.cardName + ')');
    console.log('User:', billingKeyData.name || billingKeyData.email);

    // Generate order details
    const now = new Date();
    const dateStr = now.toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const merchantUid = `MOND_${dateStr}_${random}`;
    const customerUid = `customer_${billingKeyData.fk_userId}`;
    const amount = 100; // Test with 100 won
    const name = 'Amond Pro 멤버십 (테스트)';

    console.log('\n3. Payment Details:');
    console.log('Merchant UID:', merchantUid);
    console.log('Customer UID:', customerUid);
    console.log('Amount:', amount, 'KRW');
    console.log('Product:', name);

    // First, let's check if customer exists
    console.log('\n4. Checking customer info...');
    try {
      const customerResponse = await axios.get(
        `${IAMPORT_CONFIG.apiUrl}/subscribe/customers/${customerUid}`,
        {
          headers: {
            "Authorization": accessToken
          }
        }
      );
      console.log('Customer exists:', customerResponse.data.code === 0 ? 'Yes' : 'No');
      if (customerResponse.data.code === 0) {
        console.log('Customer data:', JSON.stringify(customerResponse.data.response, null, 2));
      }
    } catch (error) {
      console.log('Customer not found (this is expected for first-time billing)');
    }

    // Try to make payment using customer_uid
    console.log('\n5. Attempting payment with customer_uid...');
    
    const paymentData = {
      customer_uid: customerUid,
      merchant_uid: merchantUid,
      amount: amount,
      name: name,
      buyer_name: billingKeyData.name || '테스트',
      buyer_email: billingKeyData.email || 'test@test.com',
      buyer_tel: '01012345678',
      buyer_addr: '서울특별시',
      buyer_postcode: '00000'
    };

    console.log('Payment request data:', JSON.stringify(paymentData, null, 2));

    try {
      const response = await axios.post(
        `${IAMPORT_CONFIG.apiUrl}/subscribe/payments/again`,
        paymentData,
        {
          headers: {
            "Authorization": accessToken,
            "Content-Type": "application/json"
          }
        }
      );

      console.log('\n6. Payment Response:');
      console.log('Status:', response.status);
      console.log('Response:', JSON.stringify(response.data, null, 2));

      if (response.data.code === 0) {
        console.log('\n✅ PAYMENT SUCCESS!');
        const payment = response.data.response;
        console.log('Transaction ID:', payment.imp_uid);
        console.log('Amount:', payment.amount, 'KRW');
        console.log('Card:', payment.card_name);
        console.log('Status:', payment.status);
      } else {
        console.log('\n❌ PAYMENT FAILED');
        console.log('Error Code:', response.data.code);
        console.log('Error Message:', response.data.message);
      }

      // Save result to payment_logs
      const paymentStatus = response.data.code === 0 ? 'success' : 'failed';
      await connection.execute(`
        INSERT INTO payment_logs (
          fk_userId, orderNumber, billingKey, price, goodName,
          buyerName, buyerTel, buyerEmail, paymentStatus, inicisResponse, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
        billingKeyData.fk_userId,
        merchantUid,
        billingKeyData.billingKey,
        amount,
        name,
        billingKeyData.name || '테스트',
        '01012345678',
        billingKeyData.email || 'test@test.com',
        paymentStatus,
        JSON.stringify(response.data)
      ]);

    } catch (error) {
      console.error('\n❌ Request Error:', error.response?.data || error.message);
      
      // If customer_uid doesn't exist, we might need to register the billing key first
      if (error.response?.data?.message?.includes('customer_uid')) {
        console.log('\n7. Customer UID not found. The billing key might not be registered with Iamport.');
        console.log('Note: The billing key was created through INICIS StdPay, not through Iamport.');
        console.log('To use Iamport billing, you need to:');
        console.log('1. Create billing keys through Iamport payment window or API');
        console.log('2. Or register existing INICIS billing keys with Iamport (if supported)');
      }
    }

  } catch (error) {
    console.error('Test Error:', error);
  } finally {
    await connection.end();
  }
}

// Run the test
testIamportBilling();