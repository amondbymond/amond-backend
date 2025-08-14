const axios = require('axios');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// INICIS Test Configuration
const INICIS_CONFIG = {
  mid: "INIBillTst",
  signKey: "SU5JTElURV9UUklQTEVERVNfS0VZU1RS",
  apiKey: "rKnPljRn5m6J9Mzz",
  // Based on INICIS docs, for billing we might need different endpoints
  authUrl: "https://stgstdpay.inicis.com/stdpay/INIStdPayAuth.jsp",
  billingUrl: "https://stgstdpay.inicis.com/stdpay/INIStdPayBillReq.jsp"
};

function generateSHA256Hash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function testDirectBilling() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'amond',
    port: process.env.DB_PORT || 3306,
  });

  try {
    console.log('\n=== TESTING INICIS DIRECT BILLING ===\n');

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
    console.log('Using Billing Key:', billingKeyData.billingKey);
    console.log('Card:', billingKeyData.cardNumber, '(' + billingKeyData.cardName + ')');

    // Generate order number and timestamp
    const timestamp = Date.now().toString();
    const orderNumber = `TEST_${timestamp}`;
    const price = 100; // Test with 100 won

    console.log('\nTest Payment Details:');
    console.log('Order Number:', orderNumber);
    console.log('Amount:', price, 'KRW');

    // According to INICIS template, we need these signatures
    const signatureData = `billKey=${billingKeyData.billingKey}&mid=${INICIS_CONFIG.mid}&orderNumber=${orderNumber}&price=${price}&timestamp=${timestamp}`;
    const signature = generateSHA256Hash(signatureData);

    const verificationData = `billKey=${billingKeyData.billingKey}&mid=${INICIS_CONFIG.mid}&orderNumber=${orderNumber}&price=${price}&signKey=${INICIS_CONFIG.signKey}&timestamp=${timestamp}`;
    const verification = generateSHA256Hash(verificationData);

    console.log('\nSignatures generated');

    // Prepare billing request data (form-urlencoded)
    const billingData = new URLSearchParams({
      mid: INICIS_CONFIG.mid,
      orderNumber: orderNumber,
      timestamp: timestamp,
      billKey: billingKeyData.billingKey,
      price: price.toString(),
      goodName: 'Test Recurring Payment',
      buyerName: billingKeyData.name || '테스트',
      buyerEmail: billingKeyData.email || 'test@test.com',
      buyerTel: '01012345678',
      signature: signature,
      verification: verification,
      charset: 'UTF-8',
      format: 'JSON'
    });

    console.log('\nSending billing request to INICIS...');
    console.log('URL:', INICIS_CONFIG.billingUrl);

    try {
      const response = await axios.post(INICIS_CONFIG.billingUrl, billingData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        timeout: 30000,
        validateStatus: function (status) {
          return status < 500; // Accept all status codes below 500
        }
      });

      console.log('\nResponse Status:', response.status);
      console.log('Response Headers:', response.headers);
      
      if (response.headers['content-type']?.includes('json')) {
        console.log('Response Data:', JSON.stringify(response.data, null, 2));
      } else {
        console.log('Response (first 500 chars):', response.data.substring(0, 500));
        
        // Try to extract error from HTML
        const titleMatch = response.data.match(/<title>(.*?)<\/title>/i);
        if (titleMatch) {
          console.log('\nExtracted Error:', titleMatch[1]);
        }
      }

      // Save test result
      await connection.execute(`
        INSERT INTO payment_logs (
          fk_userId, orderNumber, billingKey, price, goodName,
          buyerName, buyerTel, buyerEmail, paymentStatus, inicisResponse, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
        billingKeyData.fk_userId,
        orderNumber,
        billingKeyData.billingKey,
        price,
        'Test Recurring Payment',
        billingKeyData.name || '테스트',
        '01012345678',
        billingKeyData.email || 'test@test.com',
        'test',
        JSON.stringify({ 
          status: response.status, 
          data: response.data 
        })
      ]);

    } catch (error) {
      console.error('\nRequest Error:', error.message);
      if (error.response) {
        console.log('Error Response Status:', error.response.status);
        console.log('Error Response:', error.response.data);
      }
    }

  } catch (error) {
    console.error('Test Error:', error);
  } finally {
    await connection.end();
  }
}

// Run the test
testDirectBilling();