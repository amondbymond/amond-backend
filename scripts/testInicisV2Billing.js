const axios = require('axios');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// Date formatting function
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

async function testV2Billing() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'amond',
    port: process.env.DB_PORT || 3306,
  });

  try {
    console.log('\n=== TESTING INICIS V2 BILLING API ===\n');

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

    // INICIS V2 API Configuration
    const key = "rKnPljRn5m6J9Mzz";  
    const iv = "W2KLNKra6Wxc1P==";
    const mid = "INIBillTst";    
    const type = "billing";
    const paymethod = "card";
    const nowDate = new Date();
    const timestamp = nowDate.YYYYMMDDHHMMSS();
    const clientIp = "127.0.0.1";

    // Create data object
    const data = {
        url: "www.mond.io.kr",
        moid: mid + "_" + timestamp,
        goodName: "Amond Pro 멤버십",
        buyerName: billingKeyData.name || "테스트",
        buyerEmail: billingKeyData.email || "test@inicis.com",
        buyerTel: "01012345678",
        price: "100",  // Test with 100 won
        billKey: billingKeyData.billingKey
    };

    console.log('\nTest Payment Details:');
    console.log('Order ID:', data.moid);
    console.log('Amount:', data.price, 'KRW');
    console.log('Timestamp:', timestamp);

    // Hash Encryption
    let plainTxt = key + mid + type + timestamp + JSON.stringify(data);
    plainTxt = plainTxt.replace(/\\/g, ''); 
    const hashData = crypto.createHash('sha512').update(plainTxt).digest('hex');

    console.log('\nHash generated (SHA512)');

    const apiUrl = "https://iniapi.inicis.com/v2/pg/billing";

    let options = {
        mid: mid,
        type: type,
        paymethod: paymethod,
        timestamp: timestamp,
        clientIp: clientIp, 
        data: data,
        hashData: hashData
    };

    console.log('\nSending V2 billing request to INICIS...');
    console.log('URL:', apiUrl);

    try {
      const response = await axios.post(apiUrl, options, {
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

      // Save test result
      const paymentStatus = response.data?.resultCode === '00' ? 'success' : 'failed';
      
      await connection.execute(`
        INSERT INTO payment_logs (
          fk_userId, orderNumber, billingKey, price, goodName,
          buyerName, buyerTel, buyerEmail, paymentStatus, inicisResponse, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
        billingKeyData.fk_userId,
        data.moid,
        billingKeyData.billingKey,
        data.price,
        data.goodName,
        data.buyerName,
        data.buyerTel,
        data.buyerEmail,
        paymentStatus,
        JSON.stringify(response.data)
      ]);

      if (response.data?.resultCode === '00') {
        console.log('\n✅ BILLING SUCCESS!');
        console.log('TID:', response.data.tid);
        console.log('Auth Date:', response.data.authDate);
        console.log('Auth Time:', response.data.authTime);
      } else {
        console.log('\n❌ BILLING FAILED');
        console.log('Result Code:', response.data?.resultCode);
        console.log('Result Message:', response.data?.resultMsg);
      }

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
testV2Billing();