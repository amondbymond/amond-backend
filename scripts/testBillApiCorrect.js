const axios = require('axios');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// INICIS Configuration
const mid = "INIBillTst";
const apiKey = "rKnPljRn5m6J9Mzz";
const apiUrl = "https://iniapi.inicis.com/v2";

function generateSHA512Hash(data) {
  return crypto.createHash('sha512').update(data).digest('hex');
}

function getTimestamp() {
  return Date.now();
}

async function testCorrectBillAPI() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'amond',
    port: process.env.DB_PORT || 3306,
  });

  try {
    console.log('\n=== TESTING CORRECT V2 API FORMAT ===\n');
    
    // Test 1: Register billing key with correct v2 format
    console.log('--- Test 1: Register Billing Key (v2 Format) ---');
    
    const timestamp = getTimestamp();
    const orderId = `BILL_${timestamp}`;
    
    // v2 API expects this structure based on error message
    const requestData = {
      mid: mid,
      orderId: orderId,
      orderName: "Amond 정기결제 등록",
      amount: 0,
      buyer: {
        name: "테스트",
        email: "test@test.com",
        tel: "01012345678"
      },
      authentication: {
        authenticationType: "CARD",
        cardNumber: "5409600000000003",
        cardExpiry: "2025-12",
        identityNumber: "820213",
        cardPassword: "00"
      },
      extra: {
        requestBillingKey: true
      }
    };
    
    // Generate signature
    const signatureData = apiKey + orderId + requestData.amount + timestamp;
    const signature = generateSHA512Hash(signatureData);
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-MID': mid,
      'X-Timestamp': timestamp.toString(),
      'X-Signature': signature
    };
    
    console.log('Request:');
    console.log('URL:', `${apiUrl}/payments`);
    console.log('Order ID:', orderId);
    console.log('Headers:', headers);
    
    try {
      const response = await axios.post(`${apiUrl}/payments`, requestData, {
        headers: headers,
        timeout: 30000,
        validateStatus: function (status) {
          return true;
        }
      });
      
      console.log('\nResponse Status:', response.status);
      console.log('Response:', JSON.stringify(response.data, null, 2));
      
      if (response.data?.status === 'PAID' || response.data?.billingKey) {
        const billKey = response.data.billingKey || response.data.tid;
        console.log('\n✅ BILLING KEY OBTAINED:', billKey);
        
        // Save to database
        await connection.execute(
          `UPDATE billing_keys SET status = 'inactive' WHERE fk_userId = 27 AND status = 'active'`
        );
        
        await connection.execute(`
          INSERT INTO billing_keys (
            fk_userId, orderNumber, billingKey, cardNumber, cardName, status, createdAt
          ) VALUES (?, ?, ?, ?, ?, 'active', NOW())
        `, [27, orderId, billKey, "540960******0003", "테스트카드"]);
        
        console.log('\n✅ Billing key saved!');
        
        // Test 2: Make recurring payment
        console.log('\n--- Test 2: Recurring Payment ---');
        
        const payTimestamp = getTimestamp();
        const payOrderId = `PAY_${payTimestamp}`;
        
        const paymentData = {
          mid: mid,
          orderId: payOrderId,
          orderName: "Amond Pro 멤버십",
          amount: 100,
          buyer: {
            name: "테스트",
            email: "test@test.com",
            tel: "01012345678"
          },
          billingKey: billKey
        };
        
        const paySignature = generateSHA512Hash(apiKey + payOrderId + 100 + payTimestamp);
        
        const payResponse = await axios.post(`${apiUrl}/billing/payments`, paymentData, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'X-MID': mid,
            'X-Timestamp': payTimestamp.toString(),
            'X-Signature': paySignature
          },
          timeout: 30000,
          validateStatus: function (status) {
            return true;
          }
        });
        
        console.log('\nPayment Response:', JSON.stringify(payResponse.data, null, 2));
        
        if (payResponse.data?.status === 'PAID') {
          console.log('\n✅ RECURRING PAYMENT SUCCESS!');
        }
      }
    } catch (error) {
      console.log('\nRequest error:', error.message);
      if (error.response) {
        console.log('Error data:', error.response.data);
      }
    }
    
    // Test 3: Try StdPay to Bill conversion
    console.log('\n--- Test 3: StdPay to Bill Conversion ---');
    
    const [stdPayKeys] = await connection.execute(`
      SELECT billingKey FROM billing_keys 
      WHERE billingKey LIKE 'StdpayCARD%' 
      ORDER BY id DESC LIMIT 1
    `);
    
    if (stdPayKeys.length > 0) {
      const stdPayKey = stdPayKeys[0].billingKey;
      console.log('StdPay key:', stdPayKey);
      
      // Try to convert StdPay key to Bill key
      const convertData = {
        mid: mid,
        stdPayBillingKey: stdPayKey,
        requestBillingKey: true
      };
      
      try {
        const convertResponse = await axios.post(`${apiUrl}/billing/convert`, convertData, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          timeout: 30000,
          validateStatus: function (status) {
            return true;
          }
        });
        
        console.log('\nConvert Response:', JSON.stringify(convertResponse.data, null, 2));
      } catch (error) {
        console.log('Convert error:', error.message);
      }
    }

  } catch (error) {
    console.error('\nTest Error:', error.message);
  } finally {
    await connection.end();
  }
}

// Run the test
testCorrectBillAPI();