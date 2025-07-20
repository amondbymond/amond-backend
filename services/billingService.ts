import axios from "axios";
import crypto from "crypto";
import { queryAsync } from "../module/commonFunction";
import dotenv from "dotenv";
dotenv.config();

// INICIS 설정
const INICIS_CONFIG = {
  test: {
    mid: process.env.INICIS_TEST_MID || "INIBillTst",
    apiKey: process.env.INICIS_TEST_API_KEY || "rKnPljRn5m6J9Mzz",
    apiIv: process.env.INICIS_TEST_API_IV || "W2KLNKra6Wxc1P==",
    apiUrl: "https://iniapi.inicis.com/v2/pg/billing"
  },
  production: {
    mid: process.env.INICIS_PROD_MID || "",
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
 * 활성 구독자들의 정기결제 처리
 */
export async function processMonthlyBilling() {
  console.log("[BillingService] 월간 정기결제 프로세스 시작");
  
  try {
    // 결제가 필요한 활성 구독자 조회
    // TEST MODE: NOW()를 사용하여 시간까지 비교
    const activeSubs = await queryAsync(`
      SELECT 
        ps.*,
        bk.billingKey,
        bk.cardNumber,
        bk.cardName,
        u.email,
        u.name,
        TIMESTAMPDIFF(MINUTE, ps.startDate, NOW()) as minutesSinceStart
      FROM payment_subscriptions ps
      JOIN billing_keys bk ON ps.fk_userId = bk.fk_userId AND bk.status = 'active'
      JOIN user u ON ps.fk_userId = u.id
      WHERE ps.status = 'active'
        AND ps.nextBillingDate <= NOW()
        AND ps.planType = 'pro'
        AND TIMESTAMPDIFF(MINUTE, ps.startDate, NOW()) <= 5  -- TEST: 가입 후 5분 이내만
    `);

    console.log(`[BillingService] 처리할 구독: ${activeSubs.length}건`);

    for (const subscription of activeSubs) {
      await processSingleBilling(subscription);
    }

    console.log("[BillingService] 월간 정기결제 프로세스 완료");
  } catch (error) {
    console.error("[BillingService] 월간 정기결제 프로세스 에러:", error);
  }
}

/**
 * 개별 구독 결제 처리
 */
async function processSingleBilling(subscription: any) {
  const timestamp = new Date().getTime().toString();
  const moid = `AMOND_AUTO_${subscription.fk_userId}_${timestamp}`;
  
  try {
    // 결제 요청 데이터 구성
    const detail = {
      url: "service.amond.io.kr",
      moid: moid,
      goodName: "프로 멤버십 월간 구독",
      buyerName: subscription.name || "회원",
      buyerEmail: subscription.email,
      buyerTel: "01012345678",
      price: subscription.price.toString(),
      billKey: subscription.billingKey,
      authentification: "00",
      cardQuota: "00",
      quotaInterest: "0"
    };

    const detailsJson = JSON.stringify(detail);
    const plainTxt = config.apiKey + config.mid + "billing" + timestamp + detailsJson;
    const hashData = generateSHA512Hash(plainTxt);

    const postData = {
      mid: config.mid,
      type: "billing",
      paymethod: "Card",
      timestamp: timestamp,
      clientIp: "127.0.0.1",
      hashData: hashData,
      data: detail
    };

    console.log(`[BillingService] 결제 요청 - 사용자: ${subscription.fk_userId}, 금액: ${subscription.price}`);

    // INICIS API 호출
    const response = await axios.post(config.apiUrl, postData, {
      headers: {
        "Content-Type": "application/json;charset=utf-8"
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
      moid,
      subscription.billingKey,
      subscription.price,
      "프로 멤버십 월간 구독",
      subscription.name || "회원",
      "01012345678",
      subscription.email,
      result.resultCode === "00" ? "success" : "failed",
      JSON.stringify(result)
    ]);

    if (result.resultCode === "00") {
      // 결제 성공 시 다음 결제일 업데이트
      const nextBillingDate = new Date();
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      
      await queryAsync(`
        UPDATE payment_subscriptions 
        SET nextBillingDate = ?
        WHERE id = ?
      `, [nextBillingDate, subscription.id]);

      // 멤버십 종료일 연장
      await queryAsync(`
        UPDATE user 
        SET membershipEndDate = DATE_ADD(membershipEndDate, INTERVAL 1 MONTH)
        WHERE id = ?
      `, [subscription.fk_userId]);

      console.log(`[BillingService] 결제 성공 - 사용자: ${subscription.fk_userId}`);
    } else {
      // 결제 실패 처리
      console.error(`[BillingService] 결제 실패 - 사용자: ${subscription.fk_userId}, 오류: ${result.resultMsg}`);
      
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
          SET status = 'suspended' 
          WHERE id = ?
        `, [subscription.id]);
        
        console.log(`[BillingService] 구독 일시정지 - 사용자: ${subscription.fk_userId}`);
      }
    }
  } catch (error) {
    console.error(`[BillingService] 결제 처리 에러 - 사용자: ${subscription.fk_userId}`, error);
  }
}

/**
 * 만료된 멤버십 처리
 */
export async function processExpiredMemberships() {
  console.log("[BillingService] 만료된 멤버십 처리 시작");
  
  try {
    // 만료된 프로 멤버십을 basic으로 다운그레이드
    const result = await queryAsync(`
      UPDATE user 
      SET grade = 'basic', 
          membershipStatus = 'expired'
      WHERE grade = 'pro' 
        AND membershipEndDate < CURDATE()
        AND membershipStatus IN ('active', 'cancelled')
    `);

    console.log(`[BillingService] ${result.affectedRows}개의 멤버십이 만료 처리되었습니다.`);
    
    // 취소된 구독 중 만료일이 지난 것들을 expired로 변경
    await queryAsync(`
      UPDATE payment_subscriptions 
      SET status = 'expired'
      WHERE status = 'cancelled' 
        AND nextBillingDate < CURDATE()
    `);
  } catch (error) {
    console.error("[BillingService] 만료된 멤버십 처리 에러:", error);
  }
}