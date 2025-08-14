const axios = require('axios');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// INICIS Bill API Configuration
const INICIS_BILL_CONFIG = {
  mid: "INIBillTst",
  apiKey: "rKnPljRn5m6J9Mzz",
  apiUrl: "https://iniapi.inicis.com/api/v1"
};

// Date formatting
Date.prototype.YYYYMMDDHHMMSS = function () {
    var yyyy = this.getFullYear().toString();
    var MM = pad(this.getMonth() + 1, 2);
    var dd = pad(this.getDate(), 2);
    var hh = pad(this.getHours(), 2);
    var mm = pad(this.getMinutes(), 2)
    var ss = pad(this.getSeconds(), 2)
  
    return yyyy + MM + dd + hh + mm + ss;
};
  
function pad(number, length) {
    var str = '' + number;
    while (str.length < length) {
        str = '0' + str;
    }
    return str;
}

function generateSHA512Hash(data) {
  return crypto.createHash('sha512').update(data).digest('hex');
}

async function testDirectBillAPI() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'amond',
    port: process.env.DB_PORT || 3306,
  });

  try {
    console.log('\n=== TESTING DIRECT INICIS BILL API ===\n');

    const nowDate = new Date();
    const timestamp = nowDate.YYYYMMDDHHMMSS();
    const moid = `${INICIS_BILL_CONFIG.mid}_${timestamp}`;

    // Test 1: Register Billing Key using direct API
    console.log('\n--- Test 1: Register Billing Key ---');
    
    // Card registration data for Bill API
    const regData = {
      type: "Auth",
      paymethod: "Billkey",
      timestamp: timestamp,
      clientIp: "127.0.0.1",
      mid: INICIS_BILL_CONFIG.mid,
      url: "www.mond.io.kr",
      moid: moid,
      cardNumber: "5409600000000003",
      cardExpire: "2512",
      regNo: "820213",
      cardPw: "00"
    };

    // Create signature
    const signatureData = Object.keys(regData)
      .sort()
      .map(key => `${key}=${regData[key]}`)
      .join('&') + `&hashKey=${INICIS_BILL_CONFIG.apiKey}`;
    
    const signature = generateSHA512Hash(signatureData);

    console.log('Registration Request:');
    console.log('MID:', INICIS_BILL_CONFIG.mid);
    console.log('MOID:', moid);
    console.log('Type:', regData.type);

    // Try direct auth endpoint
    const authUrl = `${INICIS_BILL_CONFIG.apiUrl}/inicis/auth`;
    console.log('\nTrying:', authUrl);

    try {
      const authResponse = await axios.post(authUrl, regData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(INICIS_BILL_CONFIG.mid + ':' + INICIS_BILL_CONFIG.apiKey).toString('base64')}`,
          'hashData': signature
        },
        timeout: 30000,
        validateStatus: function (status) {
          return true;
        }
      });

      console.log('\nAuth Response Status:', authResponse.status);
      console.log('Auth Response:', JSON.stringify(authResponse.data, null, 2));

      if (authResponse.data?.resultCode === '00' || authResponse.data?.billKey) {
        const billKey = authResponse.data.billKey || authResponse.data.tid;
        console.log('\n✅ Billing Key Obtained:', billKey);
        
        // Test 2: Use billing key for payment
        console.log('\n--- Test 2: Make Payment with Billing Key ---');
        
        const paymentTimestamp = new Date().YYYYMMDDHHMMSS();
        const paymentMoid = `${INICIS_BILL_CONFIG.mid}_PAY_${paymentTimestamp}`;
        
        const payData = {
          type: "Billing",
          paymethod: "Card",
          timestamp: paymentTimestamp,
          clientIp: "127.0.0.1",
          mid: INICIS_BILL_CONFIG.mid,
          url: "www.mond.io.kr",
          moid: paymentMoid,
          goodName: "Amond Pro 멤버십",
          buyerName: "테스트",
          buyerEmail: "test@test.com",
          buyerTel: "01012345678",
          price: "100",
          billKey: billKey
        };
        
        const paySignatureData = Object.keys(payData)
          .sort()
          .map(key => `${key}=${payData[key]}`)
          .join('&') + `&hashKey=${INICIS_BILL_CONFIG.apiKey}`;
        
        const paySignature = generateSHA512Hash(paySignatureData);
        
        const payUrl = `${INICIS_BILL_CONFIG.apiUrl}/inicis/billing`;
        console.log('\nTrying payment:', payUrl);
        
        const payResponse = await axios.post(payUrl, payData, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(INICIS_BILL_CONFIG.mid + ':' + INICIS_BILL_CONFIG.apiKey).toString('base64')}`,
            'hashData': paySignature
          },
          timeout: 30000,
          validateStatus: function (status) {
            return true;
          }
        });
        
        console.log('\nPayment Response Status:', payResponse.status);
        console.log('Payment Response:', JSON.stringify(payResponse.data, null, 2));
        
        if (payResponse.data?.resultCode === '00') {
          console.log('\n✅ Payment SUCCESS!');
          console.log('TID:', payResponse.data.tid);
          
          // Save to database
          await connection.execute(
            `UPDATE billing_keys SET status = 'inactive' WHERE fk_userId = 27 AND status = 'active'`
          );
          
          await connection.execute(`
            INSERT INTO billing_keys (
              fk_userId, orderNumber, billingKey, cardNumber, cardName, status, createdAt
            ) VALUES (?, ?, ?, ?, ?, 'active', NOW())
          `, [27, moid, billKey, "540960******0003", "테스트카드"]);
          
          console.log('\n✅ Billing key saved to database!');
          console.log('This key can be used for recurring payments.');
        }
      }
    } catch (error) {
      console.log('\nAuth endpoint error:', error.message);
    }

    // Test alternate endpoints
    console.log('\n--- Test 3: Trying alternate endpoints ---');
    
    const endpoints = [
      '/billing/key',
      '/billkey/register',
      '/v1/billing/key',
      '/pay/billkey'
    ];
    
    for (const endpoint of endpoints) {
      const url = `https://iniapi.inicis.com${endpoint}`;
      console.log(`\nTrying: ${url}`);
      
      try {
        const response = await axios.post(url, {
          mid: INICIS_BILL_CONFIG.mid,
          cardNo: "5409600000000003",
          expYear: "25",
          expMon: "12",
          idNo: "820213",
          cardPw: "00"
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${INICIS_BILL_CONFIG.apiKey}`
          },
          timeout: 5000,
          validateStatus: function (status) {
            return true;
          }
        });
        
        console.log(`Response: ${response.status} - ${JSON.stringify(response.data).substring(0, 100)}`);
        
        if (response.status === 200 && response.data?.billKey) {
          console.log('\n✅ Found working endpoint!');
          break;
        }
      } catch (error) {
        console.log(`Error: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('\nTest Error:', error.message);
    if (error.response) {
      console.log('Error Response:', error.response.data);
    }
  } finally {
    await connection.end();
  }
}

// Run the test
testDirectBillAPI();