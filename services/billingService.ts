import axios from "axios";
import crypto from "crypto";
import { queryAsync } from "../module/commonFunction";
import dotenv from "dotenv";
dotenv.config();

// INICIS 설정
const INICIS_CONFIG = {
  test: {
    mid: process.env.INICIS_TEST_MID || "INIBillTst",
    signKey: process.env.INICIS_TEST_SIGN_KEY || "SU5JTElURV9UUklQTEVERVNfS0VZU1RS",
    apiKey: process.env.INICIS_TEST_API_KEY || "rKnPljRn5m6J9Mzz",
    apiIv: process.env.INICIS_TEST_API_IV || "W2KLNKra6Wxc1P==",
    apiUrl: "https://stginiapi.inicis.com/v2/pg/billing"
  },
  production: {
    mid: process.env.INICIS_PROD_MID || "",
    signKey: process.env.INICIS_PROD_SIGN_KEY || "",
    apiKey: process.env.INICIS_PROD_API_KEY || "",
    apiIv: process.env.INICIS_PROD_API_IV || "",
    apiUrl: "https://iniapi.inicis.com/v2/pg/billing"
  }
};

const isProduction = process.env.NODE_ENV === "production";
const config = isProduction ? INICIS_CONFIG.production : INICIS_CONFIG.test;

/**
 * SHA512 해시 생성 함수
 */
function generateSHA512Hash(data: string): string {
  return crypto.createHash("sha512").update(data).digest("hex");
}

/**
 * 주문번호 생성 함수
 */
function generateOrderNumber(): string {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `MOND_${dateStr}_${random}`;
}

/**
 * 활성 구독자들의 정기결제 처리
 */
export async function processMonthlyBilling() {
  console.log("[Billing] Starting monthly billing process...");
  
  try {
    // 결제가 필요한 활성 구독자 조회
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
      ORDER BY ps.nextBillingDate ASC
      LIMIT 10
    `);

    console.log(`[Billing] Found ${activeSubs.length} subscriptions due for billing`);

    for (const subscription of activeSubs) {
      await processSingleBilling(subscription);
      // 요청 사이에 지연 추가 (rate limiting 방지)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log("[Billing] Monthly billing process completed");
  } catch (error) {
    console.error("[Billing] Error in processMonthlyBilling:", error);
  }
}

/**
 * 개별 구독 결제 처리
 */
async function processSingleBilling(subscription: any) {
  const orderNumber = generateOrderNumber();
  const timestamp = new Date().getTime().toString();
  
  try {
    console.log(`[Billing] Processing payment for user ${subscription.fk_userId}, plan: ${subscription.planType}`);

    // Plan별 가격 설정
    const planPrices: { [key: string]: number } = {
      'pro': 9900,
      'business': 29000,
      'premium': 79000
    };

    const price = planPrices[subscription.planType] || subscription.price;
    const goodName = `Amond ${subscription.planType.charAt(0).toUpperCase() + subscription.planType.slice(1)} 멤버십`;

    // INICIS 빌링 결제 요청 데이터
    const plainText = `mid=${config.mid}&orderNumber=${orderNumber}&timestamp=${timestamp}`;
    const hashData = generateSHA256Hash(plainText);
    const authentification = Buffer.from(hashData).toString('base64');

    // URL 인코딩된 폼 데이터 생성
    const billingData = new URLSearchParams({
      mid: config.mid,
      orderNumber: orderNumber,
      timestamp: timestamp,
      price: price.toString(),
      billKey: subscription.billingKey,
      goodName: goodName,
      buyerName: subscription.name || subscription.email?.split('@')[0] || "고객",
      buyerEmail: subscription.email || "noreply@amond.io",
      buyerTel: "01000000000",
      authentification: authentification,
      charset: "UTF-8",
      format: "JSON"
    });

    console.log(`[Billing] Sending request for order ${orderNumber}`);

    // INICIS API 호출
    const response = await axios.post(config.apiUrl, billingData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      timeout: 30000
    });

    const result = response.data;
    
    // 결제 로그 저장
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
      orderNumber,
      subscription.billingKey,
      price,
      goodName,
      subscription.name || subscription.email.split('@')[0],
      "01000000000",
      subscription.email,
      result.resultCode === "00" ? "success" : "failed",
      JSON.stringify(result)
    ]);

    if (result.resultCode === "00") {
      console.log(`[Billing] SUCCESS - User ${subscription.fk_userId} charged ${price} KRW`);
      
      // 결제 성공 시 다음 결제일 업데이트
      const nextBillingDate = new Date();
      
      // TEST MODE: 1분 후 재결제 (프로덕션에서는 1달 후)
      if (!isProduction) {
        nextBillingDate.setMinutes(nextBillingDate.getMinutes() + 1);
        console.log(`[TEST MODE] Next billing in 1 minute`);
      } else {
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      }
      
      await queryAsync(`
        UPDATE payment_subscriptions 
        SET nextBillingDate = ?,
            updatedAt = NOW()
        WHERE id = ?
      `, [nextBillingDate, subscription.id]);

      // 멤버십 종료일 연장
      await queryAsync(`
        UPDATE user 
        SET membershipEndDate = ?
        WHERE id = ?
      `, [nextBillingDate, subscription.fk_userId]);

      console.log(`[Billing] Updated next billing date for user ${subscription.fk_userId}`);
    } else {
      // 결제 실패 처리
      console.error(`[Billing] FAILED - User ${subscription.fk_userId}: ${result.resultMsg}`);
      
      // 3회 실패 시 구독 일시정지
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
        
        console.log(`[Billing] Subscription suspended for user ${subscription.fk_userId} after 3 failures`);
      }
    }
  } catch (error) {
    console.error(`[Billing] Error processing payment for user ${subscription.fk_userId}:`, error);
    
    // Plan별 가격 설정 (에러 처리를 위해 다시 정의)
    const planPrices: { [key: string]: number } = {
      'pro': 9900,
      'business': 29000,
      'premium': 79000
    };
    const price = planPrices[subscription.planType] || subscription.price;
    
    // 에러 로그 저장
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
      orderNumber,
      subscription.billingKey,
      price,
      `Amond ${subscription.planType} 멤버십`,
      subscription.name || subscription.email?.split('@')[0] || "고객",
      "01000000000",
      subscription.email || "noreply@amond.io",
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
    ]);
  }
}

/**
 * 만료된 멤버십 처리
 */
export async function processExpiredMemberships() {
  console.log("[Billing] Checking for expired memberships...");
  
  try {
    // 만료된 멤버십을 basic으로 다운그레이드
    const result = await queryAsync(`
      UPDATE user 
      SET grade = 'basic', 
          membershipStatus = 'expired'
      WHERE grade IN ('pro', 'business', 'premium')
        AND membershipEndDate < NOW()
        AND membershipStatus IN ('active', 'cancelled')
    `);

    if (result.affectedRows > 0) {
      console.log(`[Billing] Downgraded ${result.affectedRows} expired memberships to basic`);
    }
    
    // 취소된 구독 중 만료일이 지난 것들을 expired로 변경
    const expiredSubs = await queryAsync(`
      UPDATE payment_subscriptions 
      SET status = 'expired',
          updatedAt = NOW()
      WHERE status = 'cancelled' 
        AND nextBillingDate < NOW()
    `);
    
    if (expiredSubs.affectedRows > 0) {
      console.log(`[Billing] Marked ${expiredSubs.affectedRows} cancelled subscriptions as expired`);
    }
    
    // 정지된 구독 중 7일이 지난 것들을 expired로 변경
    const suspendedExpired = await queryAsync(`
      UPDATE payment_subscriptions 
      SET status = 'expired',
          updatedAt = NOW()
      WHERE status = 'suspended' 
        AND updatedAt < DATE_SUB(NOW(), INTERVAL 7 DAY)
    `);
    
    if (suspendedExpired.affectedRows > 0) {
      console.log(`[Billing] Marked ${suspendedExpired.affectedRows} suspended subscriptions as expired`);
    }
  } catch (error) {
    console.error("[Billing] Error processing expired memberships:", error);
  }
}