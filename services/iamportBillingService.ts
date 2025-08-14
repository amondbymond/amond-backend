import axios from "axios";
import { queryAsync } from "../module/commonFunction";
import dotenv from "dotenv";
dotenv.config();

// Iamport 설정
const IAMPORT_CONFIG = {
  apiKey: process.env.IAMPORT_API_KEY || "3170176238757586", // 테스트 API Key
  apiSecret: process.env.IAMPORT_API_SECRET || "6e3ae0d4bd08a75cdaa659f99b5ca68e4e1b2e39e1e37f5fc17b5ac8e97e088a7f4c77f0d4de1eb6", // 테스트 API Secret
  apiUrl: "https://api.iamport.kr"
};

// 테스트 모드 설정
const TEST_MODE = process.env.BILLING_TEST_MODE === "true";
const BILLING_INTERVAL_MINUTES = TEST_MODE ? 1 : 0; // 테스트: 1분, 프로덕션: 0 (실제 날짜 계산)

/**
 * Iamport Access Token 발급
 */
async function getIamportAccessToken(): Promise<string> {
  try {
    const response = await axios.post(`${IAMPORT_CONFIG.apiUrl}/users/getToken`, {
      imp_key: IAMPORT_CONFIG.apiKey,
      imp_secret: IAMPORT_CONFIG.apiSecret
    });

    if (response.data.code === 0) {
      return response.data.response.access_token;
    } else {
      throw new Error(`Failed to get access token: ${response.data.message}`);
    }
  } catch (error) {
    console.error("[Iamport] Error getting access token:", error);
    throw error;
  }
}

/**
 * 주문번호 생성 함수
 */
function generateMerchantUid(): string {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `MOND_${dateStr}_${random}`;
}

/**
 * customer_uid 생성 (userId 기반)
 */
function getCustomerUid(userId: number): string {
  return `customer_${userId}`;
}

/**
 * Iamport를 통한 정기결제 처리
 */
export async function processIamportBilling() {
  console.log("[Iamport Billing] Starting monthly billing process...");
  
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

    console.log(`[Iamport Billing] Found ${activeSubs.length} subscriptions due for billing`);

    // Access token 먼저 발급
    const accessToken = await getIamportAccessToken();
    console.log("[Iamport Billing] Access token obtained");

    for (const subscription of activeSubs) {
      await processSingleIamportBilling(subscription, accessToken);
      // 요청 사이에 지연 추가 (rate limiting 방지)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log("[Iamport Billing] Monthly billing process completed");
  } catch (error) {
    console.error("[Iamport Billing] Error in processIamportBilling:", error);
  }
}

/**
 * 개별 구독 결제 처리 (Iamport API 사용)
 */
async function processSingleIamportBilling(subscription: any, accessToken: string) {
  const merchantUid = generateMerchantUid();
  const customerUid = getCustomerUid(subscription.fk_userId);
  
  try {
    console.log(`[Iamport Billing] Processing payment for user ${subscription.fk_userId}, plan: ${subscription.planType}`);

    // Plan별 가격 설정
    const planPrices: { [key: string]: number } = {
      'pro': 9900,
      'business': 29000,
      'premium': 79000
    };

    const price = planPrices[subscription.planType] || subscription.price;
    const name = `Amond ${subscription.planType.charAt(0).toUpperCase() + subscription.planType.slice(1)} 멤버십`;

    console.log(`[Iamport Billing] Requesting payment for order ${merchantUid}`);

    // Iamport 정기결제 API 호출
    const response = await axios.post(
      `${IAMPORT_CONFIG.apiUrl}/subscribe/payments/again`,
      {
        customer_uid: customerUid,
        merchant_uid: merchantUid,
        amount: price,
        name: name,
        buyer_name: subscription.name || subscription.email?.split('@')[0] || "고객",
        buyer_email: subscription.email || "noreply@amond.io",
        buyer_tel: "01000000000",
        buyer_addr: "서울특별시",
        buyer_postcode: "00000"
      },
      {
        headers: {
          "Authorization": accessToken,
          "Content-Type": "application/json"
        }
      }
    );

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
      merchantUid,
      subscription.billingKey,
      price,
      name,
      subscription.name || subscription.email?.split('@')[0] || "고객",
      "01000000000",
      subscription.email || "noreply@amond.io",
      result.code === 0 ? "success" : "failed",
      JSON.stringify(result)
    ]);

    if (result.code === 0) {
      console.log(`[Iamport Billing] SUCCESS - User ${subscription.fk_userId} charged ${price} KRW`);
      console.log(`[Iamport Billing] Transaction ID: ${result.response.imp_uid}`);
      
      // 결제 성공 시 다음 결제일 업데이트
      const nextBillingDate = new Date();
      
      // 테스트 모드 또는 프로덕션 모드에 따라 다음 결제일 설정
      if (TEST_MODE) {
        nextBillingDate.setMinutes(nextBillingDate.getMinutes() + BILLING_INTERVAL_MINUTES);
        console.log(`[TEST MODE] Next billing in ${BILLING_INTERVAL_MINUTES} minute(s)`);
      } else {
        // 프로덕션: 정확히 1달 후
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

      console.log(`[Iamport Billing] Updated next billing date for user ${subscription.fk_userId}`);
    } else {
      // 결제 실패 처리
      console.error(`[Iamport Billing] FAILED - User ${subscription.fk_userId}: ${result.message}`);
      
      // 실패 사유가 빌링키 문제인 경우
      if (result.message && result.message.includes("빌링키")) {
        console.error(`[Iamport Billing] Billing key issue for user ${subscription.fk_userId}`);
        
        // 빌링키를 비활성화
        await queryAsync(`
          UPDATE billing_keys 
          SET status = 'inactive' 
          WHERE fk_userId = ? AND billingKey = ?
        `, [subscription.fk_userId, subscription.billingKey]);
      }
      
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
        
        console.log(`[Iamport Billing] Subscription suspended for user ${subscription.fk_userId} after 3 failures`);
      }
    }
  } catch (error) {
    console.error(`[Iamport Billing] Error processing payment for user ${subscription.fk_userId}:`, error);
    
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
      merchantUid,
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
  console.log("[Iamport Billing] Checking for expired memberships...");
  
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
      console.log(`[Iamport Billing] Downgraded ${result.affectedRows} expired memberships to basic`);
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
      console.log(`[Iamport Billing] Marked ${expiredSubs.affectedRows} cancelled subscriptions as expired`);
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
      console.log(`[Iamport Billing] Marked ${suspendedExpired.affectedRows} suspended subscriptions as expired`);
    }
  } catch (error) {
    console.error("[Iamport Billing] Error processing expired memberships:", error);
  }
}