const axios = require('axios');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// INICIS Bill API Configuration (Different from StdPay!)
const INICIS_BILL_CONFIG = {
  mid: "INIBillTst", // Bill API test MID
  apiKey: "ItEQKi3rY7uvDS8l", // Bill API Key
  apiUrl: "https://iniapi.inicis.com/api/v1", // Bill API URL
  iv: "HYb3yQ4f65QL89==", // Initialization Vector
};

// AES-128-CBC encryption for INICIS Bill API
function encryptAES(text, key, iv) {
  const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(key, 'utf8'), Buffer.from(iv, 'utf8'));
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
}

// Create billing key using INICIS Bill API
async function createBillingKey() {
  try {
    console.log('\n=== CREATING BILLING KEY WITH INICIS BILL API ===\n');

    const timestamp = new Date().getTime();
    const cardNumber = "5406-9600-0000-0003"; // Test card
    const expiry = "202512";
    const birthOrBusiness = "820213"; // Birth YYMMDD or Business number
    const passwd2digit = "00"; // First 2 digits of card password

    // Encrypt card data
    const cardData = {
      CardNo: cardNumber.replace(/-/g, ''),
      ExpYear: expiry.substring(0, 4),
      ExpMon: expiry.substring(4, 6),
      IDNo: birthOrBusiness,
      CardPw: passwd2digit
    };

    const encryptedData = encryptAES(JSON.stringify(cardData), INICIS_BILL_CONFIG.apiKey, INICIS_BILL_CONFIG.iv);

    // Create request
    const requestData = {
      type: "Auth",
      paymethod: "Card",
      timestamp: timestamp,
      clientIp: "127.0.0.1",
      mid: INICIS_BILL_CONFIG.mid,
      moid: `TEST_${timestamp}`,
      data: encryptedData
    };

    console.log('Request URL:', `${INICIS_BILL_CONFIG.apiUrl}/formpay`);
    console.log('Request Data:', JSON.stringify({...requestData, data: '[ENCRYPTED]'}, null, 2));

    const response = await axios.post(`${INICIS_BILL_CONFIG.apiUrl}/formpay`, requestData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('\nResponse:', JSON.stringify(response.data, null, 2));

    if (response.data.resultCode === '00') {
      console.log('\n✅ Billing Key Created Successfully!');
      console.log('Billing Key:', response.data.billKey);
      return response.data.billKey;
    } else {
      console.log('\n❌ Failed to create billing key');
      console.log('Error:', response.data.resultMsg);
      return null;
    }

  } catch (error) {
    console.error('\nError creating billing key:', error.response?.data || error.message);
    return null;
  }
}

// Make payment using billing key
async function makePaymentWithBillingKey(billKey) {
  try {
    console.log('\n=== MAKING PAYMENT WITH BILLING KEY ===\n');

    const timestamp = new Date().getTime();
    const price = 1000; // 1000 won

    // Create payment data
    const paymentData = {
      BillKey: billKey,
      Amt: price,
      BuyerName: "테스트",
      BuyerEmail: "test@test.com",
      BuyerTel: "01012345678",
      GoodsName: "테스트 상품"
    };

    const encryptedData = encryptAES(JSON.stringify(paymentData), INICIS_BILL_CONFIG.apiKey, INICIS_BILL_CONFIG.iv);

    const requestData = {
      type: "Billing",
      paymethod: "Card",
      timestamp: timestamp,
      clientIp: "127.0.0.1",
      mid: INICIS_BILL_CONFIG.mid,
      moid: `ORDER_${timestamp}`,
      data: encryptedData
    };

    console.log('Making payment with billing key:', billKey);

    const response = await axios.post(`${INICIS_BILL_CONFIG.apiUrl}/formpay`, requestData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('\nPayment Response:', JSON.stringify(response.data, null, 2));

    if (response.data.resultCode === '00') {
      console.log('\n✅ Payment Successful!');
      console.log('TID:', response.data.tid);
      console.log('Amount:', price);
    } else {
      console.log('\n❌ Payment Failed');
      console.log('Error:', response.data.resultMsg);
    }

  } catch (error) {
    console.error('\nError making payment:', error.response?.data || error.message);
  }
}

// Main test function
async function testInicisBillAPI() {
  // First, create a billing key
  const billKey = await createBillingKey();
  
  if (billKey) {
    // Then make a payment with it
    await makePaymentWithBillingKey(billKey);
  }
}

// Run the test
testInicisBillAPI();