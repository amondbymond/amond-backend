import express from "express";
import crypto from "crypto";
import { queryAsync } from "../module/commonFunction";
import { isLogin } from "../module/needAuth";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

// INICIS configuration
const INICIS_CONFIG = {
  test: {
    mid: process.env.INICIS_TEST_MID || "INIBillTst",
    signKey: process.env.INICIS_TEST_SIGN_KEY || "SU5JTElURV9UUklQTEVERVNfS0VZU1RS",
    jsUrl: "https://stgstdpay.inicis.com/stdjs/INIStdPay.js"
  },
  production: {
    mid: process.env.INICIS_PROD_MID || "",
    signKey: process.env.INICIS_PROD_SIGN_KEY || "",
    jsUrl: "https://stdpay.inicis.com/stdjs/INIStdPay.js"
  }
};

const isProduction = process.env.NODE_ENV === "production" && process.env.INICIS_USE_PRODUCTION === "true";
const config = isProduction ? INICIS_CONFIG.production : INICIS_CONFIG.test;

/**
 * SHA256 해시 생성 함수
 */
function generateSHA256Hash(data: string): string {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
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
 * 빌링키 발급을 위한 결제창 요청 데이터 생성
 * GET /inicis-webstandard/billing-auth
 */
router.get("/billing-auth", isLogin, async function (req, res) {
  try {
    const userId = req.user?.id;
    const { plan } = req.query; // Get plan from query params
    const timestamp = Date.now().toString(); // Use Unix timestamp in milliseconds
    const oid = `BILL_${getFormattedTimestamp()}_${userId}`; // Keep formatted timestamp for OID
    
    // Set price based on plan
    let price = "0"; // Default 0 for billing key registration
    let goodname = "Amond 정기결제 등록";
    
    if (plan === 'pro') {
      goodname = "Amond Pro 멤버십 (월 9,900원)";
    } else if (plan === 'business') {
      goodname = "Amond Business 멤버십 (월 29,000원)";
    } else if (plan === 'premium') {
      goodname = "Amond Premium 멤버십 (월 79,000원)";
    }
    
    // Get user info
    const userInfo = await queryAsync(
      "SELECT email, name FROM user WHERE id = ?",
      [userId]
    );
    
    if (!userInfo || userInfo.length === 0) {
      return res.status(404).json({
        success: false,
        message: "사용자 정보를 찾을 수 없습니다."
      });
    }
    
    const user = userInfo[0];
    const buyerName = user.name || "고객";
    const buyerEmail = user.email || "customer@mond.io.kr";
    
    // Generate signature for billing key issuance
    const mKey = generateSHA256Hash(config.signKey);
    const signatureData = `oid=${oid}&price=${price}&timestamp=${timestamp}`;
    const signature = generateSHA256Hash(signatureData);
    
    // Prepare data for WebStandard payment window
    const paymentData = {
      // Basic parameters (order matters!)
      version: "1.0",
      mid: config.mid,
      oid: oid,
      price: price,
      timestamp: timestamp,
      signature: signature,
      mKey: mKey,
      currency: "WON",
      goodname: goodname,
      buyername: buyerName,
      buyertel: "01000000000",
      buyeremail: buyerEmail,
      returnUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/billing-return`,
      closeUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/close`,
      gopaymethod: "Card",
      acceptmethod: "BILLAUTH(Card)", // Simplified for billing key
      charset: "UTF-8",
      languageView: "ko",
      payViewType: "popup", // Popup for PC compatibility
      popupUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/popup`, // Required for popup type
      
      // Custom parameters
      merchantData: JSON.stringify({
        userId: userId,
        type: "billing_key_registration",
        plan: plan || 'pro' // Pass the plan type
      })
    };
    
    res.status(200).json({
      success: true,
      data: {
        jsUrl: config.jsUrl,
        paymentData: paymentData
      }
    });
    
  } catch (error) {
    console.error("빌링키 발급 요청 데이터 생성 에러:", error);
    res.status(500).json({
      success: false,
      message: "빌링키 발급 요청 중 오류가 발생했습니다."
    });
  }
});

/**
 * 빌링키 발급 결과 처리 (결제창에서 리턴)
 * POST /inicis-webstandard/billing-return
 */
router.post("/billing-return", async function (req, res) {
  try {
    const {
      resultCode,
      resultMsg,
      mid,
      orderNumber,
      authToken,
      authUrl,
      charset,
      merchantData,
      billKey,
      billKeyExpireDate,
      authenticatedString
    } = req.body;
    
    console.log("[Billing Return] Received data:", {
      resultCode,
      resultMsg,
      orderNumber,
      billKey: billKey ? "Received" : "Not received",
      billKeyExpireDate
    });
    
    // Parse merchant data to get userId
    let userId;
    try {
      const parsedData = JSON.parse(merchantData || "{}");
      userId = parsedData.userId;
    } catch (e) {
      console.error("Failed to parse merchantData:", e);
    }
    
    if (resultCode !== "0000") {
      // Billing key issuance failed
      console.error("[Billing Return] Failed:", resultCode, resultMsg);
      return res.status(400).json({
        success: false,
        message: resultMsg || "빌링키 발급에 실패했습니다.",
        errorCode: resultCode
      });
    }
    
    if (!billKey) {
      console.error("[Billing Return] No billing key received");
      return res.status(400).json({
        success: false,
        message: "빌링키가 발급되지 않았습니다."
      });
    }
    
    // Save billing key to database
    if (userId) {
      // Deactivate old billing keys
      await queryAsync(
        "UPDATE billing_keys SET status = 'inactive' WHERE fk_userId = ? AND status = 'active'",
        [userId]
      );
      
      // Save new billing key
      await queryAsync(`
        INSERT INTO billing_keys (
          fk_userId,
          orderNumber,
          billingKey,
          cardNumber,
          cardName,
          status,
          billKeyExpireDate,
          createdAt
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, NOW())
      `, [
        userId,
        orderNumber,
        billKey,
        "****-****-****-****", // Card number masked by INICIS
        "카드", // Card name will be in authenticatedString
        billKeyExpireDate || null
      ]);
      
      // Parse merchant data to get plan info
      let planType = 'pro'; // default
      let planPrice = 9900;
      
      try {
        const parsedData = JSON.parse(merchantData || "{}");
        if (parsedData.plan) {
          planType = parsedData.plan;
          const planPrices: { [key: string]: number } = {
            'pro': 9900,
            'business': 29000,
            'premium': 79000
          };
          planPrice = planPrices[planType] || 9900;
        }
      } catch (e) {
        console.log("Could not parse plan from merchantData");
      }
      
      // Create or update subscription
      const [existingSubs] = await queryAsync(
        "SELECT id FROM payment_subscriptions WHERE fk_userId = ? AND status = 'active'",
        [userId]
      );
      
      if (existingSubs.length === 0) {
        const startDate = new Date();
        const nextBillingDate = new Date();
        // Set first billing to happen immediately (in 1 minute for testing)
        if (process.env.BILLING_TEST_MODE === 'true') {
          nextBillingDate.setMinutes(nextBillingDate.getMinutes() + 1);
          console.log("[Billing Return] Test mode - first billing in 1 minute");
        } else {
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
        }
        
        await queryAsync(`
          INSERT INTO payment_subscriptions (
            fk_userId,
            planType,
            status,
            startDate,
            nextBillingDate,
            price,
            billingCycle,
            createdAt
          ) VALUES (?, ?, 'active', ?, ?, ?, 'monthly', NOW())
        `, [userId, planType, startDate, nextBillingDate, planPrice]);
        
        // Update user grade
        await queryAsync(`
          UPDATE user 
          SET grade = ?,
              membershipStartDate = ?,
              membershipEndDate = ?,
              membershipStatus = 'active'
          WHERE id = ?
        `, [planType, startDate, nextBillingDate, userId]);
      }
    }
    
    res.status(200).json({
      success: true,
      message: "빌링키가 성공적으로 등록되었습니다.",
      data: {
        billKey: billKey,
        expireDate: billKeyExpireDate
      }
    });
    
  } catch (error) {
    console.error("빌링키 발급 결과 처리 에러:", error);
    res.status(500).json({
      success: false,
      message: "빌링키 발급 결과 처리 중 오류가 발생했습니다."
    });
  }
});

/**
 * 빌링키 삭제
 * DELETE /inicis-webstandard/billing/:billKey
 */
router.delete("/billing/:billKey", isLogin, async function (req, res) {
  try {
    const { billKey } = req.params;
    const userId = req.user?.id;
    
    const result = await queryAsync(
      "UPDATE billing_keys SET status = 'inactive' WHERE billingKey = ? AND fk_userId = ?",
      [billKey, userId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "빌링키를 찾을 수 없습니다."
      });
    }
    
    res.status(200).json({
      success: true,
      message: "빌링키가 삭제되었습니다."
    });
    
  } catch (error) {
    console.error("빌링키 삭제 에러:", error);
    res.status(500).json({
      success: false,
      message: "빌링키 삭제 중 오류가 발생했습니다."
    });
  }
});

export default router;