import { queryAsync } from "../module/commonFunction";
import dotenv from "dotenv";
dotenv.config();

// 테스트 모드 설정
const TEST_MODE = process.env.BILLING_TEST_MODE === "true";
const BILLING_INTERVAL_MINUTES = TEST_MODE ? 1 : 0; // 테스트: 1분, 프로덕션: 0 (실제 날짜 계산)

/**
 * Mock 정기결제 처리 (테스트용)
 * 실제 결제는 하지 않고 성공으로 처리
 */
export async function processMockMonthlyBilling() {
  console.log("[Mock Billing] Starting mock monthly billing process...");
  
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

    console.log(`[Mock Billing] Found ${activeSubs.length} subscriptions due for billing`);

    for (const subscription of activeSubs) {
      await processSingleMockBilling(subscription);
      // 요청 사이에 지연 추가
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log("[Mock Billing] Mock monthly billing process completed");
  } catch (error) {
    console.error("[Mock Billing] Error in processMockMonthlyBilling:", error);
  }
}

/**
 * 개별 Mock 결제 처리
 */
async function processSingleMockBilling(subscription: any) {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const orderNumber = `MOCK_${subscription.fk_userId}_${timestamp}`;
  
  try {
    console.log(`[Mock Billing] Processing MOCK payment for user ${subscription.fk_userId}, plan: ${subscription.planType}`);

    // Plan별 가격 설정
    const planPrices: { [key: string]: number } = {
      'pro': 9900,
      'business': 29000,
      'premium': 79000
    };

    const price = planPrices[subscription.planType] || subscription.price;
    const goodName = `Amond ${subscription.planType.charAt(0).toUpperCase() + subscription.planType.slice(1)} 멤버십`;

    // Mock 결제 성공 확률 (90% 성공)
    const isSuccess = Math.random() > 0.1;
    const mockTid = `MOCK${timestamp}${Math.floor(Math.random() * 10000)}`;

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
      subscription.name || subscription.email?.split('@')[0] || "테스트",
      "01000000000",
      subscription.email || "test@test.com",
      isSuccess ? "success" : "failed",
      JSON.stringify({
        resultCode: isSuccess ? "00" : "01",
        resultMsg: isSuccess ? "MOCK 결제 성공" : "MOCK 결제 실패 (테스트)",
        tid: mockTid,
        isMockPayment: true,
        testMode: true
      })
    ]);

    if (isSuccess) {
      console.log(`[Mock Billing] ✅ SUCCESS - User ${subscription.fk_userId} MOCK charged ${price} KRW`);
      console.log(`[Mock Billing] Mock TID: ${mockTid}`);
      
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

      console.log(`[Mock Billing] Updated next billing date for user ${subscription.fk_userId}`);
    } else {
      // Mock 결제 실패 처리
      console.error(`[Mock Billing] ❌ FAILED - User ${subscription.fk_userId}: MOCK payment failed (test)`);
    }
  } catch (error) {
    console.error(`[Mock Billing] Error processing mock payment for user ${subscription.fk_userId}:`, error);
    
    // Plan별 가격 설정 (에러 처리를 위해)
    const planPrices: { [key: string]: number } = {
      'pro': 9900,
      'business': 29000,
      'premium': 79000
    };
    
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
      planPrices[subscription.planType] || subscription.price,
      `Amond ${subscription.planType} 멤버십`,
      subscription.name || "테스트",
      "01000000000",
      subscription.email || "test@test.com",
      JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error),
        isMockPayment: true 
      })
    ]);
  }
}

/**
 * 만료된 멤버십 처리
 */
export async function processExpiredMemberships() {
  console.log("[Mock Billing] Checking for expired memberships...");
  
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
      console.log(`[Mock Billing] Downgraded ${result.affectedRows} expired memberships to basic`);
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
      console.log(`[Mock Billing] Marked ${expiredSubs.affectedRows} cancelled subscriptions as expired`);
    }
  } catch (error) {
    console.error("[Mock Billing] Error processing expired memberships:", error);
  }
}