import crypto from "crypto";
import axios from "axios";
import { queryAsync } from "../module/commonFunction";
import dotenv from "dotenv";
dotenv.config();

// INICIS configuration
const INICIS_CONFIG = {
  test: {
    mid: process.env.INICIS_TEST_MID || "INIBillTst",
    signKey: process.env.INICIS_TEST_SIGN_KEY || "SU5JTElURV9UUklQTEVERVNfS0VZU1RS",
    key: process.env.INICIS_TEST_KEY || "rKnPljRn5m6J9Mzz",
    iv: process.env.INICIS_TEST_IV || "W2KLNKra6Wxc1P==",
    apiUrl: "https://iniapi.inicis.com/v2/pg/billing"
  },
  production: {
    mid: process.env.INICIS_PROD_MID || "",
    signKey: process.env.INICIS_PROD_SIGN_KEY || "",
    key: process.env.INICIS_PROD_KEY || "",
    iv: process.env.INICIS_PROD_IV || "",
    apiUrl: "https://iniapi.inicis.com/v2/pg/billing"
  }
};

const isProduction = process.env.NODE_ENV === "production" && process.env.INICIS_USE_PRODUCTION === "true";
const config = isProduction ? INICIS_CONFIG.production : INICIS_CONFIG.test;

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
 * SHA512 해시 생성 함수
 */
function generateSHA512Hash(data: string): string {
  return crypto.createHash("sha512").update(data, "utf8").digest("hex");
}

/**
 * 빌링키를 사용한 결제 처리
 */
export async function processBillingPayment(
  userId: number,
  billKey: string,
  amount: number,
  goodName: string
): Promise<any> {
  try {
    const timestamp = getFormattedTimestamp();
    const oid = `${config.mid}_${timestamp}`;
    
    // Get user info
    const [userInfo] = await queryAsync(
      "SELECT email, name FROM user WHERE id = ?",
      [userId]
    );
    
    if (!userInfo) {
      throw new Error("사용자 정보를 찾을 수 없습니다.");
    }
    
    // Prepare request data
    const data = {
      url: process.env.FRONTEND_URL || "http://localhost:3000",
      moid: oid,
      goodName: goodName,
      buyerName: userInfo.name || "고객",
      buyerEmail: userInfo.email || "customer@mond.io.kr",
      buyerTel: "01000000000",
      price: amount.toString(),
      billKey: billKey
    };
    
    // Generate hash
    const plainText = config.key + config.mid + "billing" + timestamp + JSON.stringify(data);
    const hashData = generateSHA512Hash(plainText.replace(/\\/g, ''));
    
    // Prepare API request
    const requestBody = {
      mid: config.mid,
      type: "billing",
      paymethod: "card",
      timestamp: timestamp,
      clientIp: "127.0.0.1", // You might want to get real IP in production
      data: data,
      hashData: hashData
    };
    
    console.log("[Recurring Billing] Processing payment for user:", userId, "Amount:", amount);
    
    // Make API request
    const response = await axios.post(config.apiUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'charset': 'UTF-8'
      }
    });
    
    console.log("[Recurring Billing] Response:", response.data);
    
    // Check response
    if (response.data.resultCode === "00") {
      // Payment successful
      const tid = response.data.data?.tid;
      const authDate = response.data.data?.authDate;
      const authTime = response.data.data?.authTime;
      
      // Save payment record
      await queryAsync(`
        INSERT INTO payment_history (
          fk_userId,
          tid,
          moid,
          amount,
          resultCode,
          resultMsg,
          authDate,
          paymentType,
          status,
          createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'recurring', 'completed', NOW())
      `, [
        userId,
        tid,
        oid,
        amount,
        response.data.resultCode,
        response.data.resultMsg,
        authDate ? `${authDate} ${authTime}` : new Date(),
      ]);
      
      return {
        success: true,
        tid: tid,
        message: "결제가 성공적으로 처리되었습니다."
      };
    } else {
      // Payment failed
      console.error("[Recurring Billing] Payment failed:", response.data);
      
      // Save failed payment record
      await queryAsync(`
        INSERT INTO payment_history (
          fk_userId,
          moid,
          amount,
          resultCode,
          resultMsg,
          paymentType,
          status,
          createdAt
        ) VALUES (?, ?, ?, ?, ?, 'recurring', 'failed', NOW())
      `, [
        userId,
        oid,
        amount,
        response.data.resultCode,
        response.data.resultMsg
      ]);
      
      return {
        success: false,
        message: response.data.resultMsg || "결제 처리에 실패했습니다.",
        errorCode: response.data.resultCode
      };
    }
  } catch (error) {
    console.error("[Recurring Billing] Error:", error);
    throw error;
  }
}

/**
 * Process all pending recurring payments
 */
export async function processAllRecurringPayments(): Promise<void> {
  try {
    console.log("[Recurring Billing] Starting batch processing...");
    
    // Get all active subscriptions that need billing
    const subscriptions = await queryAsync(`
      SELECT 
        s.id,
        s.fk_userId,
        s.planType,
        s.price,
        s.nextBillingDate,
        u.email,
        u.name,
        bk.billingKey
      FROM payment_subscriptions s
      JOIN user u ON s.fk_userId = u.id
      JOIN billing_keys bk ON bk.fk_userId = u.id AND bk.status = 'active'
      WHERE s.status = 'active'
      AND s.nextBillingDate <= NOW()
      ORDER BY s.nextBillingDate ASC
    `);
    
    console.log(`[Recurring Billing] Found ${subscriptions.length} subscriptions to process`);
    
    for (const subscription of subscriptions) {
      try {
        console.log(`[Recurring Billing] Processing subscription ${subscription.id} for user ${subscription.fk_userId}`);
        
        // Process payment
        const result = await processBillingPayment(
          subscription.fk_userId,
          subscription.billingKey,
          subscription.price,
          `Amond ${subscription.planType.charAt(0).toUpperCase() + subscription.planType.slice(1)} 정기결제`
        );
        
        if (result.success) {
          // Update next billing date
          const nextBillingDate = new Date();
          if (process.env.BILLING_TEST_MODE === 'true') {
            // Test mode: bill every 5 minutes
            nextBillingDate.setMinutes(nextBillingDate.getMinutes() + 5);
          } else {
            // Production: bill monthly
            nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
          }
          
          await queryAsync(`
            UPDATE payment_subscriptions 
            SET 
              lastBillingDate = NOW(),
              nextBillingDate = ?,
              consecutiveFailures = 0
            WHERE id = ?
          `, [nextBillingDate, subscription.id]);
          
          // Update user membership end date
          await queryAsync(`
            UPDATE user 
            SET membershipEndDate = ?
            WHERE id = ?
          `, [nextBillingDate, subscription.fk_userId]);
          
          console.log(`[Recurring Billing] Successfully processed subscription ${subscription.id}`);
        } else {
          // Handle failed payment
          await queryAsync(`
            UPDATE payment_subscriptions 
            SET 
              consecutiveFailures = consecutiveFailures + 1,
              lastFailureDate = NOW()
            WHERE id = ?
          `, [subscription.id]);
          
          // Check if we should suspend subscription
          const [failureCount] = await queryAsync(
            "SELECT consecutiveFailures FROM payment_subscriptions WHERE id = ?",
            [subscription.id]
          );
          
          if (failureCount.consecutiveFailures >= 3) {
            // Suspend subscription after 3 consecutive failures
            await queryAsync(`
              UPDATE payment_subscriptions 
              SET status = 'suspended'
              WHERE id = ?
            `, [subscription.id]);
            
            await queryAsync(`
              UPDATE user 
              SET 
                membershipStatus = 'suspended',
                grade = 'normal'
              WHERE id = ?
            `, [subscription.fk_userId]);
            
            console.log(`[Recurring Billing] Suspended subscription ${subscription.id} after 3 failures`);
          }
        }
      } catch (error) {
        console.error(`[Recurring Billing] Error processing subscription ${subscription.id}:`, error);
      }
    }
    
    console.log("[Recurring Billing] Batch processing completed");
  } catch (error) {
    console.error("[Recurring Billing] Batch processing error:", error);
    throw error;
  }
}