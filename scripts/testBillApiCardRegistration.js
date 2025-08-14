const axios = require('axios');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// INICIS Bill API Configuration
const INICIS_BILL_CONFIG = {
  mid: "INIBillTst",
  apiKey: "rKnPljRn5m6J9Mzz",
  apiIv: "W2KLNKra6Wxc1P==",
  apiUrl: "https://iniapi.inicis.com/v2/pg"
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

async function testCardRegistration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'amond',
    port: process.env.DB_PORT || 3306,
  });

  try {
    console.log('\n=== TESTING INICIS BILL API CARD REGISTRATION ===\n');

    const nowDate = new Date();
    const timestamp = nowDate.YYYYMMDDHHMMSS();
    const moid = `${INICIS_BILL_CONFIG.mid}_REG_${timestamp}`;
    const type = "pay"; // For billing key registration
    const paymethod = "card";
    const clientIp = "127.0.0.1";

    // Test card information
    const testCard = {
      cardNumber: "5409600000000003", // INICIS test card
      expiry: "2512", // YYMM
      birth: "820213", // YYMMDD
      pwd2digit: "00" // First 2 digits of password
    };

    // Create data object for billing key registration
    const data = {
      url: "www.mond.io.kr",
      moid: moid,
      goodName: "Amond 정기결제 등록",
      buyerName: "테스트",
      buyerEmail: "test@test.com",
      buyerTel: "01012345678",
      price: "0", // 0 for billing key registration
      cardNumber: testCard.cardNumber,
      cardExpire: testCard.expiry,
      regNo: testCard.birth,
      cardPw: testCard.pwd2digit,
      billkey: "1" // Request billing key
    };

    console.log('Registration Details:');
    console.log('Order ID:', moid);
    console.log('Card Number:', testCard.cardNumber);
    console.log('Timestamp:', timestamp);

    // Generate hash
    let plainTxt = INICIS_BILL_CONFIG.apiKey + INICIS_BILL_CONFIG.mid + type + timestamp + JSON.stringify(data);
    plainTxt = plainTxt.replace(/\\/g, ''); 
    const hashData = generateSHA512Hash(plainTxt);

    const requestData = {
      mid: INICIS_BILL_CONFIG.mid,
      type: type,
      paymethod: paymethod,
      timestamp: timestamp,
      clientIp: clientIp,
      data: data,
      hashData: hashData
    };

    console.log('\nSending card registration request...');
    console.log('URL:', `${INICIS_BILL_CONFIG.apiUrl}/pay`);

    const response = await axios.post(`${INICIS_BILL_CONFIG.apiUrl}/pay`, requestData, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000,
      validateStatus: function (status) {
        return true; // Accept all status codes
      }
    });

    console.log('\nResponse Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));

    if (response.data?.resultCode === '00') {
      console.log('\n✅ CARD REGISTRATION SUCCESS!');
      console.log('Billing Key:', response.data.billkey || response.data.tid);
      console.log('Card Name:', response.data.cardName);
      
      // Save the billing key for user 27
      const billKey = response.data.billkey || response.data.tid;
      const cardName = response.data.cardName || "테스트카드";
      const maskedCardNumber = testCard.cardNumber.substring(0, 6) + "******" + testCard.cardNumber.substring(12);
      
      // Deactivate old billing keys
      await connection.execute(
        `UPDATE billing_keys SET status = 'inactive' WHERE fk_userId = 27 AND status = 'active'`
      );
      
      // Save new billing key
      await connection.execute(`
        INSERT INTO billing_keys (
          fk_userId, orderNumber, billingKey, cardNumber, cardName, status, createdAt
        ) VALUES (?, ?, ?, ?, ?, 'active', NOW())
      `, [27, moid, billKey, maskedCardNumber, cardName]);
      
      console.log('\n✅ Billing key saved to database for user 27');
      
      // Now test immediate billing with the new key
      console.log('\n=== TESTING BILLING WITH NEW KEY ===\n');
      
      const billingTimestamp = new Date().YYYYMMDDHHMMSS();
      const billingMoid = `${INICIS_BILL_CONFIG.mid}_${billingTimestamp}`;
      
      const billingData = {
        url: "www.mond.io.kr",
        moid: billingMoid,
        goodName: "Amond Pro 멤버십",
        buyerName: "테스트",
        buyerEmail: "test@test.com",
        buyerTel: "01012345678",
        price: "100", // Test with 100 won
        billKey: billKey
      };
      
      let billingPlainTxt = INICIS_BILL_CONFIG.apiKey + INICIS_BILL_CONFIG.mid + "billing" + billingTimestamp + JSON.stringify(billingData);
      billingPlainTxt = billingPlainTxt.replace(/\\/g, '');
      const billingHashData = generateSHA512Hash(billingPlainTxt);
      
      const billingRequestData = {
        mid: INICIS_BILL_CONFIG.mid,
        type: "billing",
        paymethod: "card",
        timestamp: billingTimestamp,
        clientIp: clientIp,
        data: billingData,
        hashData: billingHashData
      };
      
      console.log('Testing billing with new key...');
      
      const billingResponse = await axios.post(`${INICIS_BILL_CONFIG.apiUrl}/billing`, billingRequestData, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000,
        validateStatus: function (status) {
          return true;
        }
      });
      
      console.log('\nBilling Response:', JSON.stringify(billingResponse.data, null, 2));
      
      if (billingResponse.data?.resultCode === '00') {
        console.log('\n✅ BILLING SUCCESS WITH NEW KEY!');
        console.log('This billing key can be used for recurring payments!');
      } else {
        console.log('\n❌ Billing failed:', billingResponse.data?.resultMsg);
      }
      
    } else {
      console.log('\n❌ CARD REGISTRATION FAILED');
      console.log('Result Code:', response.data?.resultCode);
      console.log('Result Message:', response.data?.resultMsg);
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
testCardRegistration();