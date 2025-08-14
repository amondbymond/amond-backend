const axios = require('axios');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// INICIS v2 API Configuration
const INICIS_CONFIG = {
  mid: "INIBillTst",
  apiKey: "rKnPljRn5m6J9Mzz",
  apiUrl: "https://iniapi.inicis.com/v2"
};

function generateSHA512Hash(data) {
  return crypto.createHash('sha512').update(data).digest('hex');
}

function getTimestamp() {
  return Date.now();
}

async function testV2BillingKeyRegistration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'amond',
    port: process.env.DB_PORT || 3306,
  });

  try {
    console.log('\n=== TESTING INICIS V2 API BILLING KEY REGISTRATION ===\n');

    const timestamp = getTimestamp();
    const orderId = `BILL_${timestamp}`;

    // V2 API format based on error message
    const requestData = {
      mid: INICIS_CONFIG.mid,
      orderId: orderId,
      orderName: "Amond 정기결제 등록",
      amount: 0, // 0 for billing key registration
      buyer: {
        name: "테스트",
        email: "test@test.com",
        tel: "01012345678"
      },
      authentication: {
        authenticationType: "BILLKEY", // For billing key
        cardNumber: "5409600000000003",
        cardExpiry: "2025-12",
        identityNumber: "820213", // Birth or business number
        cardPassword: "00"
      },
      extra: {
        billingKey: true // Request billing key
      }
    };

    // Generate signature for v2 API
    const signatureData = INICIS_CONFIG.apiKey + orderId + amount + timestamp;
    const signature = generateSHA512Hash(signatureData);

    console.log('Request Details:');
    console.log('Order ID:', orderId);
    console.log('Timestamp:', timestamp);

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${INICIS_CONFIG.apiKey}`,
      'X-Timestamp': timestamp.toString(),
      'X-Signature': signature
    };

    console.log('\nSending request to v2 API...');
    console.log('URL:', `${INICIS_CONFIG.apiUrl}/payments`);

    const response = await axios.post(`${INICIS_CONFIG.apiUrl}/payments`, requestData, {
      headers: headers,
      timeout: 30000,
      validateStatus: function (status) {
        return true;
      }
    });

    console.log('\nResponse Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));

    if (response.data?.resultCode === '00' || response.data?.status === 'PAID') {
      console.log('\n✅ SUCCESS!');
      
      const billKey = response.data.billingKey || response.data.tid;
      if (billKey) {
        // Save to database
        await connection.execute(
          `UPDATE billing_keys SET status = 'inactive' WHERE fk_userId = 27 AND status = 'active'`
        );
        
        await connection.execute(`
          INSERT INTO billing_keys (
            fk_userId, orderNumber, billingKey, cardNumber, cardName, status, createdAt
          ) VALUES (?, ?, ?, ?, ?, 'active', NOW())
        `, [27, orderId, billKey, "540960******0003", "테스트카드"]);
        
        console.log('✅ Billing key saved:', billKey);
      }
    } else {
      console.log('\n❌ FAILED');
      
      // Try alternate approach - direct billing key API
      console.log('\n=== TRYING ALTERNATE BILLING KEY API ===\n');
      
      const billKeyData = {
        mid: INICIS_CONFIG.mid,
        cardNumber: "5409600000000003",
        cardExpiry: "202512",
        birthOrBusinessNumber: "820213",
        cardPassword: "00"
      };
      
      const billKeyResponse = await axios.post(`${INICIS_CONFIG.apiUrl}/billing-keys`, billKeyData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${INICIS_CONFIG.apiKey}`
        },
        timeout: 30000,
        validateStatus: function (status) {
          return true;
        }
      });
      
      console.log('Billing Key Response:', JSON.stringify(billKeyResponse.data, null, 2));
    }

  } catch (error) {
    console.error('Test Error:', error.message);
    if (error.response) {
      console.log('Error Response:', error.response.data);
    }
  } finally {
    await connection.end();
  }
}

// Run the test
testV2BillingKeyRegistration();