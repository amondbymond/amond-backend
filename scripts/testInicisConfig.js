const crypto = require('crypto');

// Test INICIS configuration
const config = {
  mid: "INIBillTst",
  signKey: "SU5JTElURV9UUklQTEVERVNfS0VZU1RS",
};

function generateSHA256Hash(data) {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

function getFormattedTimestamp() {
  const now = new Date();
  const pad = (n, length) => {
    let str = '' + n;
    while (str.length < length) {
      str = '0' + str;
    }
    return str;
  };
  
  const yyyy = now.getFullYear().toString();
  const MM = pad(now.getMonth() + 1, 2);
  const dd = pad(now.getDate(), 2);
  const hh = pad(now.getHours(), 2);
  const mm = pad(now.getMinutes(), 2);
  const ss = pad(now.getSeconds(), 2);
  
  return yyyy + MM + dd + hh + mm + ss;
}

// Generate test data
const timestamp = getFormattedTimestamp();
const oid = `BILL_${timestamp}_27`;
const price = "0";

console.log("Testing INICIS Configuration:");
console.log("==============================");
console.log("MID:", config.mid);
console.log("OID:", oid);
console.log("Price:", price);
console.log("Timestamp:", timestamp);

// Generate mKey
const mKey = generateSHA256Hash(config.signKey);
console.log("\nmKey:", mKey);

// Generate signature
const signatureData = `oid=${oid}&price=${price}&timestamp=${timestamp}`;
console.log("\nSignature Data:", signatureData);
const signature = generateSHA256Hash(signatureData);
console.log("Signature:", signature);

// Test payment data
const paymentData = {
  version: "1.0",
  mid: config.mid,
  oid: oid,
  price: price,
  timestamp: timestamp,
  signature: signature,
  mKey: mKey,
  currency: "WON",
  goodname: "Amond Pro 멤버십 (월 9,900원)",
  buyername: "test1",
  buyertel: "01000000000",
  buyeremail: "test@test.com",
  returnUrl: "http://localhost:3000/payment/billing-return",
  closeUrl: "http://localhost:3000/payment/close",
  gopaymethod: "Card",
  acceptmethod: "BILLAUTH(Card):Disable_MouseRightButton",
  charset: "UTF-8",
  languageView: "ko",
  payViewType: "popup",
  quotabase: "2:3:4:5:6:7:8:9:10:11:12"
};

console.log("\nPayment Data:");
console.log(JSON.stringify(paymentData, null, 2));

// Verify signature
const verifyData = `oid=${oid}&price=${price}&timestamp=${timestamp}`;
const verifySignature = generateSHA256Hash(verifyData);
console.log("\nSignature Verification:");
console.log("Expected:", signature);
console.log("Verified:", verifySignature);
console.log("Match:", signature === verifySignature);