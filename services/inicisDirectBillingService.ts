import axios from "axios";
import crypto from "crypto";
import { queryAsync } from "../module/commonFunction";
import dotenv from "dotenv";
dotenv.config();

// INICIS Direct Billing Configuration
const INICIS_CONFIG = {
  test: {
    mid: process.env.INICIS_TEST_MID || "INIBillTst",
    apiKey: process.env.INICIS_TEST_API_KEY || "rKnPljRn5m6J9Mzz",
    apiUrl: "https://iniapi.inicis.com/v2/pg"
  },
  production: {
    mid: process.env.INICIS_PROD_MID || "",
    apiKey: process.env.INICIS_PROD_API_KEY || "",
    apiUrl: "https://api.inicis.com/v2/pg"
  }
};

const isProduction = process.env.NODE_ENV === "production";
const config = isProduction ? INICIS_CONFIG.production : INICIS_CONFIG.test;

// Test mode for billing interval
const TEST_MODE = process.env.BILLING_TEST_MODE === "true";
const BILLING_INTERVAL_MINUTES = TEST_MODE ? 1 : 0;

/**
 * SHA512 해시 생성 함수
 */
function generateSHA512Hash(data: string): string {
  return crypto.createHash("sha512").update(data).digest("hex");
}

/**
 * YYYYMMDDHHMMSS 형식의 timestamp 생성
 */
function getFormattedTimestamp(): string {
  const now = new Date();
  const pad = (n: number, length: number): string => {
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

/**
 * Process monthly billing using INICIS direct billing
 */
export async function processDirectMonthlyBilling() {
  console.log("[INICIS Direct Billing] Starting monthly billing process...");
  
  try {
    // Get subscriptions due for billing with proper BILLAUTH billing keys
    const activeSubs = await queryAsync(`
      SELECT 
        ps.*,
        bk.billingKey,
        bk.cardNumber,
        bk.cardName,
        u.email,
        u.name
      FROM payment_subscriptions ps
      JOIN billing_keys bk ON ps.fk_userId = bk.fk_userId AND bk.status = 'active'
      JOIN user u ON ps.fk_userId = u.id
      WHERE ps.status = 'active'
        AND ps.nextBillingDate <= NOW()
        AND ps.planType != 'basic'
        AND bk.billingKey NOT LIKE 'StdpayCARD%'  -- Exclude StdPay keys, only use BILLAUTH keys
      ORDER BY ps.nextBillingDate ASC
      LIMIT 10
    `);

    console.log(`[INICIS Direct Billing] Found ${activeSubs.length} subscriptions due for billing`);

    for (const subscription of activeSubs) {
      await processSingleDirectBilling(subscription);
      // Delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log("[INICIS Direct Billing] Monthly billing process completed");
  } catch (error) {
    console.error("[INICIS Direct Billing] Error in processMonthlyBilling:", error);
  }
}

/**
 * Process single subscription billing
 */
async function processSingleDirectBilling(subscription: any) {
  const timestamp = getFormattedTimestamp();
  const moid = `${config.mid}_${timestamp}`;
  const type = "billing";
  const paymethod = "card";
  const clientIp = "127.0.0.1";
  
  try {
    console.log(`[INICIS Direct Billing] Processing payment for user ${subscription.fk_userId}, plan: ${subscription.planType}`);
    console.log(`[INICIS Direct Billing] Using billing key: ${subscription.billingKey.substring(0, 20)}...`);

    // Plan prices
    const planPrices: { [key: string]: number } = {
      'pro': 9900,
      'business': 29000,
      'premium': 79000
    };

    const price = planPrices[subscription.planType] || subscription.price;
    const goodName = `Amond ${subscription.planType.charAt(0).toUpperCase() + subscription.planType.slice(1)} 멤버십`;

    // Create data object for billing request
    // IMPORTANT: billKey here is the previously issued billing key from BILLAUTH,
    // NOT "0" or a new key. We're using an existing key for recurring payment!
    const data = {
      url: "www.mond.io.kr",
      moid: moid,
      goodName: goodName,
      buyerName: subscription.name || subscription.email?.split('@')[0] || "구매자",
      buyerEmail: subscription.email || "test@inicis.com",
      buyerTel: "01000000000",
      price: price.toString(),
      billKey: subscription.billingKey // This MUST be a previously issued BILLAUTH key
    };

    // Generate hash (INICIS INIAPI format)
    let plainTxt = config.apiKey + config.mid + type + timestamp + JSON.stringify(data);
    plainTxt = plainTxt.replace(/\\/g, ''); 
    const hashData = generateSHA512Hash(plainTxt);

    // Request data for INICIS billing API
    const requestData = {
      mid: config.mid,
      type: type,
      paymethod: paymethod,
      timestamp: timestamp,
      clientIp: clientIp,
      data: data,
      hashData: hashData
    };

    console.log(`[INICIS Direct Billing] Sending billing request for order ${moid}`);

    // Call INICIS billing API
    const response = await axios.post(`${config.apiUrl}/billing`, requestData, {
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      timeout: 30000
    });

    const result = response.data;
    
    // Save payment log
    await queryAsync(`
      INSERT INTO payment_logs (
        fk_userId,
        orderNumber,
        billingKey,
        price,
        goodName,
        buyerName,
        buyerTel,
        buyerEmail,
        paymentStatus,
        inicisResponse,
        createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      subscription.fk_userId,
      moid,
      subscription.billingKey,
      price,
      goodName,
      subscription.name || subscription.email?.split('@')[0] || "구매자",
      "01000000000",
      subscription.email || "test@inicis.com",
      (result.resultCode === "00") ? "success" : "failed",
      JSON.stringify(result)
    ]);

    if (result.resultCode === "00") {
      console.log(`[INICIS Direct Billing] SUCCESS - User ${subscription.fk_userId} charged ${price} KRW`);
      console.log(`[INICIS Direct Billing] TID: ${result.tid}`);
      
      // Update next billing date
      const nextBillingDate = new Date();
      
      if (TEST_MODE) {
        nextBillingDate.setMinutes(nextBillingDate.getMinutes() + BILLING_INTERVAL_MINUTES);
        console.log(`[TEST MODE] Next billing in ${BILLING_INTERVAL_MINUTES} minute(s)`);
      } else {
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      }
      
      await queryAsync(`
        UPDATE payment_subscriptions 
        SET nextBillingDate = ?,
            updatedAt = NOW()
        WHERE id = ?
      `, [nextBillingDate, subscription.id]);

      // Update membership end date
      await queryAsync(`
        UPDATE user 
        SET membershipEndDate = ?
        WHERE id = ?
      `, [nextBillingDate, subscription.fk_userId]);

      console.log(`[INICIS Direct Billing] Updated next billing date for user ${subscription.fk_userId}`);
    } else {
      // Payment failed
      console.error(`[INICIS Direct Billing] FAILED - User ${subscription.fk_userId}: ${result.resultMsg}`);
      console.error(`[INICIS Direct Billing] Error Code: ${result.resultCode}`);
      
      // Check if it's the "billing key not registered" error
      if (result.resultCode === "01" && result.resultMsg?.includes("1195")) {
        console.error(`[INICIS Direct Billing] Billing key not properly registered. User needs to re-register card with BILLAUTH process.`);
        
        // Deactivate the invalid billing key
        await queryAsync(`
          UPDATE billing_keys 
          SET status = 'invalid' 
          WHERE billingKey = ?
        `, [subscription.billingKey]);
      }
      
      // Check failure count
      const failCount = await queryAsync(`
        SELECT COUNT(*) as count 
        FROM payment_logs 
        WHERE fk_userId = ? 
          AND paymentStatus = 'failed' 
          AND createdAt > DATE_SUB(NOW(), INTERVAL 7 DAY)
      `, [subscription.fk_userId]);

      if (failCount[0].count >= 3) {
        await queryAsync(`
          UPDATE payment_subscriptions 
          SET status = 'suspended',
              updatedAt = NOW()
          WHERE id = ?
        `, [subscription.id]);
        
        await queryAsync(`
          UPDATE user 
          SET membershipStatus = 'expired' 
          WHERE id = ?
        `, [subscription.fk_userId]);
        
        console.log(`[INICIS Direct Billing] Subscription suspended for user ${subscription.fk_userId} after 3 failures`);
      }
    }
  } catch (error) {
    console.error(`[INICIS Direct Billing] Error processing payment for user ${subscription.fk_userId}:`, error);
    
    // Save error log
    const planPrices: { [key: string]: number } = {
      'pro': 9900,
      'business': 29000,
      'premium': 79000
    };
    const price = planPrices[subscription.planType] || subscription.price;
    
    await queryAsync(`
      INSERT INTO payment_logs (
        fk_userId,
        orderNumber,
        billingKey,
        price,
        goodName,
        buyerName,
        buyerTel,
        buyerEmail,
        paymentStatus,
        inicisResponse,
        createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'failed', ?, NOW())
    `, [
      subscription.fk_userId,
      moid,
      subscription.billingKey,
      price,
      `Amond ${subscription.planType} 멤버십`,
      subscription.name || subscription.email?.split('@')[0] || "구매자",
      "01000000000",
      subscription.email || "test@inicis.com",
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
    ]);
  }
}

/**
 * Check if a billing key is valid BILLAUTH key
 */
export async function isValidBillingKey(billingKey: string): Promise<boolean> {
  // BILLAUTH keys don't start with "StdpayCARD"
  // They have different format issued through WebStandard BILLAUTH process
  return !billingKey.startsWith("StdpayCARD");
}

/**
 * Get billing key status for a user
 */
export async function getUserBillingStatus(userId: number): Promise<{
  hasBillingKey: boolean;
  isValidKey: boolean;
  needsReregistration: boolean;
  billingKey?: string;
}> {
  const [billingKeys] = await queryAsync(`
    SELECT billingKey, status 
    FROM billing_keys 
    WHERE fk_userId = ? AND status = 'active' 
    ORDER BY id DESC LIMIT 1
  `, [userId]);
  
  if (billingKeys.length === 0) {
    return {
      hasBillingKey: false,
      isValidKey: false,
      needsReregistration: true
    };
  }
  
  const billingKey = billingKeys[0].billingKey;
  const isValid = await isValidBillingKey(billingKey);
  
  return {
    hasBillingKey: true,
    isValidKey: isValid,
    needsReregistration: !isValid,
    billingKey: billingKey
  };
}