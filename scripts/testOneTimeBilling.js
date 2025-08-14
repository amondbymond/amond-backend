const axios = require('axios');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// INICIS Test Configuration
const INICIS_CONFIG = {
  mid: "INIBillTst",
  signKey: "SU5JTElURV9UUklQTEVERVNfS0VZU1RS",
  billingUrl: "https://stgstdpay.inicis.com/stdpay/INIStdPayBillReq.jsp"
};

function generateSHA256Hash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// 한국 시간으로 YYYYMMDDHHMMSS 형식 생성
function getKSTTimestamp() {
  const now = new Date();
  // UTC에서 KST로 변환 (+9시간)
  const kstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  
  const yyyy = kstTime.getUTCFullYear().toString();
  const MM = (kstTime.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = kstTime.getUTCDate().toString().padStart(2, '0');
  const hh = kstTime.getUTCHours().toString().padStart(2, '0');
  const mm = kstTime.getUTCMinutes().toString().padStart(2, '0');
  const ss = kstTime.getUTCSeconds().toString().padStart(2, '0');
  
  return yyyy + MM + dd + hh + mm + ss;
}

async function testOneTimeBilling() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'amond',
    port: process.env.DB_PORT || 3306,
  });

  try {
    console.log('\n=== TESTING ONE-TIME BILLING WITH EXISTING BILLING KEY ===\n');

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

    // Generate order details
    const timestamp = Date.now().toString();
    const kstTimestamp = getKSTTimestamp();
    const oid = `${INICIS_CONFIG.mid}_${kstTimestamp}`;
    const price = 100; // Test with 100 won
    const goodname = 'Amond Pro 멤버십';
    const buyername = billingKeyData.name || '테스트';
    const buyertel = '01012345678';
    const buyeremail = billingKeyData.email || 'test@test.com';

    console.log('\nTest Payment Details:');
    console.log('Order ID:', oid);
    console.log('Amount:', price, 'KRW');
    console.log('Timestamp:', timestamp);
    console.log('KST Timestamp:', kstTimestamp);

    // 빌링키 결제용 해시 생성 (StdPay 방식)
    const mKey = generateSHA256Hash(INICIS_CONFIG.signKey);
    const hashData = `oid=${oid}&price=${price}&timestamp=${timestamp}`;
    const signature = generateSHA256Hash(hashData);

    console.log('\nGenerating signatures...');

    // StdPay 빌링 요청 데이터
    const billingData = {
      mid: INICIS_CONFIG.mid,
      oid: oid,
      price: price.toString(),
      timestamp: timestamp,
      signature: signature,
      mKey: mKey,
      currency: 'WON',
      goodname: goodname,
      buyername: buyername,
      buyertel: buyertel,
      buyeremail: buyeremail,
      billkey: billingKeyData.billingKey,
      authentification: '00',
      charset: 'UTF-8',
      format: 'JSON'
    };

    // URL 인코딩된 폼 데이터 생성
    const formData = Object.entries(billingData)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');

    console.log('\nSending billing request to INICIS StdPay...');
    console.log('URL:', INICIS_CONFIG.billingUrl);

    try {
      const response = await axios.post(INICIS_CONFIG.billingUrl, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'Charset': 'UTF-8'
        },
        timeout: 30000,
        validateStatus: function (status) {
          return true; // Accept all status codes
        }
      });

      console.log('\nResponse Status:', response.status);
      console.log('Response Headers:', JSON.stringify(response.headers, null, 2));
      
      if (response.headers['content-type']?.includes('json')) {
        console.log('Response Data:', JSON.stringify(response.data, null, 2));
        
        const result = response.data;
        if (result.resultCode === '00' || result.resultCode === '0000') {
          console.log('\n✅ BILLING SUCCESS!');
          console.log('TID:', result.tid);
          console.log('Auth Date:', result.applDate);
          console.log('Auth Time:', result.applTime);
        } else {
          console.log('\n❌ BILLING FAILED');
          console.log('Result Code:', result.resultCode);
          console.log('Result Message:', result.resultMsg);
        }
      } else {
        console.log('Response (first 1000 chars):', response.data.substring(0, 1000));
        
        // Try to extract error from HTML
        const titleMatch = response.data.match(/<title>(.*?)<\/title>/i);
        if (titleMatch) {
          console.log('\nExtracted Title:', titleMatch[1]);
        }
        
        // Check for INICIS error patterns
        const errorMatch = response.data.match(/resultCode["\s]*[:=]["\s]*["']?([^"',\s]+)/i);
        const msgMatch = response.data.match(/resultMsg["\s]*[:=]["\s]*["']?([^"']+)/i);
        
        if (errorMatch || msgMatch) {
          console.log('\nExtracted Error Info:');
          if (errorMatch) console.log('Code:', errorMatch[1]);
          if (msgMatch) console.log('Message:', msgMatch[1]);
        }
      }

      // Save test result
      const paymentStatus = (response.data?.resultCode === '00' || response.data?.resultCode === '0000') ? 'success' : 'failed';
      
      await connection.execute(`
        INSERT INTO payment_logs (
          fk_userId, orderNumber, billingKey, price, goodName,
          buyerName, buyerTel, buyerEmail, paymentStatus, inicisResponse, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
        billingKeyData.fk_userId,
        oid,
        billingKeyData.billingKey,
        price,
        goodname,
        buyername,
        buyertel,
        buyeremail,
        paymentStatus,
        JSON.stringify({ 
          status: response.status,
          headers: response.headers,
          data: typeof response.data === 'string' ? response.data.substring(0, 500) : response.data 
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
testOneTimeBilling();