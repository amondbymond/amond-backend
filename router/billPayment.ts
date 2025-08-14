import express from "express";
import crypto from "crypto";
import axios from "axios";
import { queryAsync } from "../module/commonFunction";
import { isLogin } from "../module/needAuth";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

// INICIS Bill API 설정
const INICIS_BILL_CONFIG = {
  test: {
    mid: process.env.INICIS_BILL_MID || "INIBillTst",
    signKey: process.env.INICIS_BILL_SIGN_KEY || "SU5JTElURV9UUklQTEVERVNfS0VZU1RS",
    apiKey: process.env.INICIS_BILL_API_KEY || "rKnPljRn5m6J9Mzz",
    apiIv: process.env.INICIS_BILL_API_IV || "W2KLNKra6Wxc1P==",
    apiUrl: "https://iniapi.inicis.com/v2/pg"
  },
  production: {
    mid: process.env.INICIS_BILL_PROD_MID || "",
    signKey: process.env.INICIS_BILL_PROD_SIGN_KEY || "",
    apiKey: process.env.INICIS_BILL_PROD_API_KEY || "",
    apiIv: process.env.INICIS_BILL_PROD_API_IV || "",
    apiUrl: "https://api.inicis.com/v2/pg"
  }
};

const isProduction = process.env.NODE_ENV === "production";
const config = isProduction ? INICIS_BILL_CONFIG.production : INICIS_BILL_CONFIG.test;

// TypeScript interfaces
interface RegisterBillingKeyRequest {
  cardNumber: string;
  expiry: string; // YYMM format
  birth: string; // YYMMDD format  
  pwd2digit: string; // First 2 digits of card password
  cardholderName?: string;
}

interface ChargeBillingKeyRequest {
  subscriptionId: number;
  amount?: number;
}

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
 * 카드 등록 및 빌링키 발급 (Bill API 사용)
 * POST /bill-payment/register-card
 */
router.post("/register-card", isLogin, async function (req, res) {
  try {
    const {
      cardNumber,
      expiry,
      birth,
      pwd2digit,
      cardholderName
    }: RegisterBillingKeyRequest = req.body;

    const userId = req.user?.id;

    // 필수 파라미터 검증
    if (!cardNumber || !expiry || !birth || !pwd2digit) {
      return res.status(400).json({
        success: false,
        message: "필수 정보가 누락되었습니다."
      });
    }

    // 카드번호 형식 검증 (숫자만, 공백/대시 제거)
    const cleanCardNumber = cardNumber.replace(/[\s-]/g, '');
    if (!/^\d{13,16}$/.test(cleanCardNumber)) {
      return res.status(400).json({
        success: false,
        message: "올바른 카드번호 형식이 아닙니다."
      });
    }

    const timestamp = getFormattedTimestamp();
    const moid = `${config.mid}_REG_${timestamp}`;
    const type = "pay"; // 빌링키 발급은 'pay' 타입 사용
    const paymethod = "card";
    const clientIp = req.ip || "127.0.0.1";

    // 빌링키 발급을 위한 data 객체
    const data = {
      url: "www.mond.io.kr",
      moid: moid,
      goodName: "Amond 정기결제 등록",
      buyerName: cardholderName || "고객",
      buyerEmail: req.user?.email || "customer@mond.io.kr",
      buyerTel: "01000000000",
      price: "0", // 빌링키 발급시 0원
      cardNumber: cleanCardNumber,
      cardExpire: expiry, // YYMM
      regNo: birth, // YYMMDD
      cardPw: pwd2digit,
      billkey: "1" // 빌링키 발급 요청
    };

    // Hash 생성
    let plainTxt = config.apiKey + config.mid + type + timestamp + JSON.stringify(data);
    plainTxt = plainTxt.replace(/\\/g, ''); 
    const hashData = generateSHA512Hash(plainTxt);

    const requestData = {
      mid: config.mid,
      type: type,
      paymethod: paymethod,
      timestamp: timestamp,
      clientIp: clientIp,
      data: data,
      hashData: hashData
    };

    console.log(`[Bill Payment] Registering card for user ${userId}`);

    // INICIS Bill API 호출
    const response = await axios.post(`${config.apiUrl}/pay`, requestData, {
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      timeout: 30000
    });

    const result = response.data;

    if (result.resultCode === "00") {
      // 빌링키 발급 성공
      const billKey = result.billkey || result.tid;
      const cardName = result.cardName || "카드";
      const maskedCardNumber = cleanCardNumber.substring(0, 6) + "******" + cleanCardNumber.substring(12);

      // 기존 빌링키 비활성화
      await queryAsync(
        `UPDATE billing_keys SET status = 'inactive' WHERE fk_userId = ? AND status = 'active'`,
        [userId]
      );

      // 새 빌링키 저장
      await queryAsync(`
        INSERT INTO billing_keys (
          fk_userId,
          orderNumber,
          billingKey,
          cardNumber,
          cardName,
          status,
          createdAt
        ) VALUES (?, ?, ?, ?, ?, 'active', NOW())
      `, [
        userId,
        moid,
        billKey,
        maskedCardNumber,
        cardName
      ]);

      // 사용자가 구독이 없으면 Pro 플랜으로 자동 생성
      const [existingSubs] = await queryAsync(
        `SELECT id FROM payment_subscriptions WHERE fk_userId = ? AND status = 'active'`,
        [userId]
      );

      if (existingSubs.length === 0) {
        const startDate = new Date();
        const nextBillingDate = new Date();
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

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
          ) VALUES (?, 'pro', 'active', ?, ?, 9900, 'monthly', NOW())
        `, [userId, startDate, nextBillingDate]);

        // 사용자 등급 업데이트
        await queryAsync(`
          UPDATE user 
          SET grade = 'pro',
              membershipStartDate = ?,
              membershipEndDate = ?,
              membershipStatus = 'active'
          WHERE id = ?
        `, [startDate, nextBillingDate, userId]);
      }

      res.status(200).json({
        success: true,
        message: "카드가 성공적으로 등록되었습니다.",
        data: {
          billKey: billKey,
          cardNumber: maskedCardNumber,
          cardName: cardName
        }
      });

    } else {
      // 빌링키 발급 실패
      console.error(`[Bill Payment] Card registration failed: ${result.resultCode} - ${result.resultMsg}`);
      
      res.status(400).json({
        success: false,
        message: result.resultMsg || "카드 등록에 실패했습니다.",
        errorCode: result.resultCode
      });
    }

  } catch (error) {
    console.error("카드 등록 에러:", error);
    
    if (axios.isAxiosError(error)) {
      return res.status(500).json({
        success: false,
        message: "결제 서버와의 통신 중 오류가 발생했습니다.",
        details: error.response?.data || error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "카드 등록 중 오류가 발생했습니다."
    });
  }
});

/**
 * 즉시 결제 테스트 (등록된 빌링키 사용)
 * POST /bill-payment/charge
 */
router.post("/charge", isLogin, async function (req, res) {
  try {
    const { subscriptionId, amount }: ChargeBillingKeyRequest = req.body;
    const userId = req.user?.id;

    // 활성 빌링키 조회
    const [billingKeys] = await queryAsync(`
      SELECT * FROM billing_keys 
      WHERE fk_userId = ? AND status = 'active'
      ORDER BY id DESC LIMIT 1
    `, [userId]);

    if (billingKeys.length === 0) {
      return res.status(400).json({
        success: false,
        message: "등록된 결제 수단이 없습니다."
      });
    }

    const billingKey = billingKeys[0];
    
    // 구독 정보 조회
    const [subscriptions] = await queryAsync(`
      SELECT * FROM payment_subscriptions
      WHERE id = ? AND fk_userId = ?
    `, [subscriptionId || 0, userId]);

    const subscription = subscriptions[0];
    if (!subscription) {
      return res.status(400).json({
        success: false,
        message: "구독 정보를 찾을 수 없습니다."
      });
    }

    const timestamp = getFormattedTimestamp();
    const moid = `${config.mid}_${timestamp}`;
    const type = "billing";
    const paymethod = "card";
    const clientIp = req.ip || "127.0.0.1";

    // Plan별 가격
    const planPrices: { [key: string]: number } = {
      'pro': 9900,
      'business': 29000,
      'premium': 79000
    };

    const price = amount || planPrices[subscription.planType] || 9900;
    const goodName = `Amond ${subscription.planType.charAt(0).toUpperCase() + subscription.planType.slice(1)} 멤버십`;

    // 빌링 결제를 위한 data 객체
    const data = {
      url: "www.mond.io.kr",
      moid: moid,
      goodName: goodName,
      buyerName: req.user?.name || "고객",
      buyerEmail: req.user?.email || "customer@mond.io.kr",
      buyerTel: "01000000000",
      price: price.toString(),
      billKey: billingKey.billingKey
    };

    // Hash 생성
    let plainTxt = config.apiKey + config.mid + type + timestamp + JSON.stringify(data);
    plainTxt = plainTxt.replace(/\\/g, ''); 
    const hashData = generateSHA512Hash(plainTxt);

    const requestData = {
      mid: config.mid,
      type: type,
      paymethod: paymethod,
      timestamp: timestamp,
      clientIp: clientIp,
      data: data,
      hashData: hashData
    };

    console.log(`[Bill Payment] Processing payment for user ${userId}, amount: ${price}`);

    // INICIS Bill API 호출
    const response = await axios.post(`${config.apiUrl}/billing`, requestData, {
      headers: {
        "Content-Type": "application/json",
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
      userId,
      moid,
      billingKey.billingKey,
      price,
      goodName,
      req.user?.name || "고객",
      "01000000000",
      req.user?.email || "customer@mond.io.kr",
      result.resultCode === "00" ? "success" : "failed",
      JSON.stringify(result)
    ]);

    if (result.resultCode === "00") {
      // 결제 성공
      const nextBillingDate = new Date();
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

      // 구독 정보 업데이트
      await queryAsync(`
        UPDATE payment_subscriptions 
        SET nextBillingDate = ?, updatedAt = NOW()
        WHERE id = ?
      `, [nextBillingDate, subscription.id]);

      // 멤버십 종료일 업데이트
      await queryAsync(`
        UPDATE user 
        SET membershipEndDate = ?
        WHERE id = ?
      `, [nextBillingDate, userId]);

      res.status(200).json({
        success: true,
        message: "결제가 성공적으로 완료되었습니다.",
        data: {
          tid: result.tid,
          amount: price,
          nextBillingDate: nextBillingDate
        }
      });

    } else {
      // 결제 실패
      res.status(400).json({
        success: false,
        message: result.resultMsg || "결제에 실패했습니다.",
        errorCode: result.resultCode
      });
    }

  } catch (error) {
    console.error("결제 처리 에러:", error);
    
    if (axios.isAxiosError(error)) {
      return res.status(500).json({
        success: false,
        message: "결제 서버와의 통신 중 오류가 발생했습니다.",
        details: error.response?.data || error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "결제 처리 중 오류가 발생했습니다."
    });
  }
});

/**
 * 등록된 카드 목록 조회
 * GET /bill-payment/cards
 */
router.get("/cards", isLogin, async function (req, res) {
  try {
    const userId = req.user?.id;

    const cards = await queryAsync(`
      SELECT 
        id,
        cardNumber,
        cardName,
        status,
        createdAt
      FROM billing_keys
      WHERE fk_userId = ?
      ORDER BY createdAt DESC
    `, [userId]);

    res.status(200).json({
      success: true,
      data: cards
    });

  } catch (error) {
    console.error("카드 목록 조회 에러:", error);
    res.status(500).json({
      success: false,
      message: "카드 목록 조회 중 오류가 발생했습니다."
    });
  }
});

/**
 * 카드 삭제 (비활성화)
 * DELETE /bill-payment/cards/:id
 */
router.delete("/cards/:id", isLogin, async function (req, res) {
  try {
    const cardId = req.params.id;
    const userId = req.user?.id;

    const result = await queryAsync(
      `UPDATE billing_keys 
       SET status = 'inactive' 
       WHERE id = ? AND fk_userId = ?`,
      [cardId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "카드를 찾을 수 없습니다."
      });
    }

    res.status(200).json({
      success: true,
      message: "카드가 삭제되었습니다."
    });

  } catch (error) {
    console.error("카드 삭제 에러:", error);
    res.status(500).json({
      success: false,
      message: "카드 삭제 중 오류가 발생했습니다."
    });
  }
});

export default router;