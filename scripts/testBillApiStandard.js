const axios = require('axios');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// INICIS Configuration for test
const mid = "INIBillTst";
const apiKey = "rKnPljRn5m6J9Mzz";
const apiUrl = "https://iniapi.inicis.com/v2/pg";

Date.prototype.YYYYMMDDHHMMSS = function () {
    var yyyy = this.getFullYear().toString();
    var MM = pad(this.getMonth() + 1, 2);
    var dd = pad(this.getDate(), 2);
    var hh = pad(this.getHours(), 2);
    var mm = pad(this.getMinutes(), 2)
    var ss = pad(this.getSeconds(), 2)
  
    return yyyy +  MM + dd + hh + mm + ss;
};
  
function pad(number, length) {
    var str = '' + number;
    while (str.length < length) {
        str = '0' + str;
    }
    return str;
}

async function testStandardBillAPI() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'amond',
    port: process.env.DB_PORT || 3306,
  });

  try {
    console.log('\n=== TESTING STANDARD BILL API FORMAT ===\n');

    // Step 1: Use existing StdPay billing key for recurring payment
    console.log('--- Step 1: Try billing with existing key ---');
    
    // Get an existing billing key from database
    const [existingKeys] = await connection.execute(`
      SELECT billingKey FROM billing_keys 
      WHERE billingKey LIKE 'StdpayCARD%' 
      ORDER BY id DESC LIMIT 1
    `);
    
    if (existingKeys.length > 0) {
      const billKey = existingKeys[0].billingKey;
      console.log('Found billing key:', billKey);
      
      // Use INICIS template format exactly
      const nowDate = new Date();
      const hashData = crypto.createHash('sha512');
      const timestamp = nowDate.YYYYMMDDHHMMSS();
      const moid = mid + "_" + timestamp;
      const price = "100";
      
      // Create data exactly like template
      const data = {
        url: "www.mond.io.kr",
        moid: moid,
        goodName: "Amond Pro 멤버십",
        buyerName: "테스트",
        buyerEmail: "test@test.com",
        buyerTel: "01012345678",
        price: price,
        billKey: billKey
      };
      
      // Hash encryption exactly like template
      let plainTxt = apiKey + mid + "billing" + timestamp + JSON.stringify(data);
      plainTxt = plainTxt.replace(/\\/g, ''); 
      hashData.update(plainTxt);
      const hashValue = hashData.digest('hex');
      
      const requestData = {
        mid: mid,
        type: "billing",
        paymethod: "card",
        timestamp: timestamp,
        clientIp: "127.0.0.1",
        data: data,
        hashData: hashValue
      };
      
      console.log('\nRequest data:');
      console.log('URL:', apiUrl + '/billing');
      console.log('MID:', mid);
      console.log('MOID:', moid);
      console.log('Type:', requestData.type);
      
      try {
        const response = await axios.post(apiUrl + '/billing', requestData, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000
        });
        
        console.log('\nResponse:', JSON.stringify(response.data, null, 2));
        
        if (response.data?.resultCode === '00') {
          console.log('\n✅ BILLING SUCCESS!');
        } else {
          console.log('\n❌ Billing failed:', response.data?.resultMsg);
        }
      } catch (error) {
        if (error.response) {
          console.log('\nError response:', error.response.status);
          console.log('Error data:', JSON.stringify(error.response.data, null, 2));
        } else {
          console.log('\nRequest error:', error.message);
        }
      }
    }
    
    // Step 2: Test card registration for Bill API
    console.log('\n--- Step 2: Register new card for Bill API ---');
    
    const regDate = new Date();
    const regTimestamp = regDate.YYYYMMDDHHMMSS();
    const regMoid = mid + "_REG_" + regTimestamp;
    
    // Card registration data
    const regData = {
      url: "www.mond.io.kr",
      moid: regMoid,
      goodName: "Amond 정기결제 등록",
      buyerName: "테스트",
      buyerEmail: "test@test.com",
      buyerTel: "01012345678",
      price: "0",
      cardNumber: "5409600000000003",
      cardExpire: "2512",
      regNo: "820213",
      cardPw: "00",
      billkey: "1"
    };
    
    // Create hash for registration
    const regHashData = crypto.createHash('sha512');
    let regPlainTxt = apiKey + mid + "pay" + regTimestamp + JSON.stringify(regData);
    regPlainTxt = regPlainTxt.replace(/\\/g, '');
    regHashData.update(regPlainTxt);
    const regHashValue = regHashData.digest('hex');
    
    const regRequestData = {
      mid: mid,
      type: "pay",
      paymethod: "card",
      timestamp: regTimestamp,
      clientIp: "127.0.0.1",
      data: regData,
      hashData: regHashValue
    };
    
    console.log('\nRegistration request:');
    console.log('URL:', apiUrl + '/pay');
    console.log('Type:', regRequestData.type);
    console.log('Billkey request:', regData.billkey);
    
    try {
      const regResponse = await axios.post(apiUrl + '/pay', regRequestData, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000
      });
      
      console.log('\nRegistration response:', JSON.stringify(regResponse.data, null, 2));
      
      if (regResponse.data?.resultCode === '00') {
        const newBillKey = regResponse.data.billkey || regResponse.data.tid;
        console.log('\n✅ CARD REGISTRATION SUCCESS!');
        console.log('New billing key:', newBillKey);
        
        // Save to database
        await connection.execute(
          `UPDATE billing_keys SET status = 'inactive' WHERE fk_userId = 27 AND status = 'active'`
        );
        
        await connection.execute(`
          INSERT INTO billing_keys (
            fk_userId, orderNumber, billingKey, cardNumber, cardName, status, createdAt
          ) VALUES (?, ?, ?, ?, ?, 'active', NOW())
        `, [27, regMoid, newBillKey, "540960******0003", regResponse.data.cardName || "테스트카드"]);
        
        console.log('\n✅ Billing key saved!');
        
        // Test immediate billing
        console.log('\n--- Step 3: Test billing with new key ---');
        
        const testDate = new Date();
        const testTimestamp = testDate.YYYYMMDDHHMMSS();
        const testMoid = mid + "_TEST_" + testTimestamp;
        
        const testData = {
          url: "www.mond.io.kr",
          moid: testMoid,
          goodName: "Amond Pro 멤버십",
          buyerName: "테스트",
          buyerEmail: "test@test.com",
          buyerTel: "01012345678",
          price: "100",
          billKey: newBillKey
        };
        
        const testHashData = crypto.createHash('sha512');
        let testPlainTxt = apiKey + mid + "billing" + testTimestamp + JSON.stringify(testData);
        testPlainTxt = testPlainTxt.replace(/\\/g, '');
        testHashData.update(testPlainTxt);
        const testHashValue = testHashData.digest('hex');
        
        const testRequestData = {
          mid: mid,
          type: "billing",
          paymethod: "card",
          timestamp: testTimestamp,
          clientIp: "127.0.0.1",
          data: testData,
          hashData: testHashValue
        };
        
        const testResponse = await axios.post(apiUrl + '/billing', testRequestData, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000
        });
        
        console.log('\nTest billing response:', JSON.stringify(testResponse.data, null, 2));
        
        if (testResponse.data?.resultCode === '00') {
          console.log('\n✅ TEST BILLING SUCCESS!');
          console.log('Recurring payments are now working!');
        }
      }
    } catch (error) {
      if (error.response) {
        console.log('\nRegistration error:', error.response.status);
        console.log('Error data:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.log('\nRequest error:', error.message);
      }
    }

  } catch (error) {
    console.error('\nTest Error:', error.message);
  } finally {
    await connection.end();
  }
}

// Run the test
testStandardBillAPI();