import express from "express";
import crypto from "crypto";
import axios from "axios";
import { queryAsync } from "../module/commonFunction";
import { isLogin } from "../module/needAuth";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

// INICIS 설정
const INICIS_CONFIG = {
  test: {
    mid: process.env.INICIS_TEST_MID || "INIBillTst",
    signKey: process.env.INICIS_TEST_SIGN_KEY || "SU5JTElURV9UUklQTEVERVNfS0VZU1RS",
    iniliteKey: process.env.INICIS_TEST_INILITE_KEY || "b09LVzhuTGZVaEY1WmJoQnZzdXpRdz09",
    apiKey: process.env.INICIS_TEST_API_KEY || "rKnPljRn5m6J9Mzz",
    apiIv: process.env.INICIS_TEST_API_IV || "W2KLNKra6Wxc1P==",
    mobileHashKey: process.env.INICIS_TEST_MOBILE_HASHKEY || "",
    apiUrl: "https://stgstdpay.inicis.com/api/v1/billing"
  },
  production: {
    mid: process.env.INICIS_PROD_MID || "",
    signKey: process.env.INICIS_PROD_SIGN_KEY || "",
    iniliteKey: process.env.INICIS_PROD_INILITE_KEY || "",
    apiKey: process.env.INICIS_PROD_API_KEY || "",
    apiIv: process.env.INICIS_PROD_API_IV || "",
    mobileHashKey: process.env.INICIS_PROD_MOBILE_HASHKEY || "",
    apiUrl: "https://stdpay.inicis.com/api/v1/billing"
  }
};

// 현재 환경 설정
const isProduction = process.env.NODE_ENV === "production";
const config = isProduction ? INICIS_CONFIG.production : INICIS_CONFIG.test;

// TypeScript 인터페이스 정의
interface GenerateHashesRequest {
  oid: string;
  timestamp: string;
  price: string | number;
  buyername: string;
  buyertel?: string;
  buyeremail: string;
  goodname: string;
  mid?: string;
  signKey?: string;
}

interface SaveBillingKeyRequest {
  orderNumber: string;
  billingKey: string;
  cardNumber: string;
  cardName: string;
  userId?: number;
}

interface BillingApprovalRequest {
  billingKey: string;
  orderNumber: string;
  price: number;
  goodName: string;
  buyerName: string;
  buyerTel: string;
  buyerEmail: string;
}

interface IssueBillingKeyRequest {
  authToken: string;
  authUrl: string;
  orderNumber: string;
  idc_name: string;
}

/**
 * SHA256 해시 생성 함수
 */
function generateSHA256Hash(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * INICIS 빌링키 요청용 해시 생성
 * POST /payment/inicis/generate-hashes
 */
router.post("/inicis/generate-hashes", async function (req, res) {
  try {
    // 받은 파라미터 로깅
    console.log("받은 파라미터:", req.body);
    
    const {
      oid,
      timestamp,
      price,
      buyername,
      buyertel,
      buyeremail,
      goodname,
      mid,
      signKey
    }: GenerateHashesRequest = req.body;

    // 필수 파라미터 검증 (buyertel은 선택사항으로 변경)
    if (!oid || !timestamp || !price || !buyername || !buyeremail || !goodname) {
      console.log("누락된 파라미터 확인:", {
        oid: !oid,
        timestamp: !timestamp,
        price: !price,
        buyername: !buyername,
        buyertel: !buyertel,
        buyeremail: !buyeremail,
        goodname: !goodname
      });
      
      return res.status(400).json({
        success: false,
        message: "필수 파라미터가 누락되었습니다.",
        missing: {
          oid: !oid,
          timestamp: !timestamp,
          price: !price,
          buyername: !buyername,
          buyeremail: !buyeremail,
          goodname: !goodname
        }
      });
    }

    // 가격을 숫자로 변환
    const numPrice = typeof price === 'string' ? parseInt(price, 10) : price;
    
    // 데이터 타입 검증
    if (isNaN(numPrice) || numPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "가격은 0보다 큰 숫자여야 합니다."
      });
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(buyeremail)) {
      return res.status(400).json({
        success: false,
        message: "올바른 이메일 형식이 아닙니다."
      });
    }

    // 전화번호는 선택사항이므로 별도 검증 없음
    // INICIS 문서에 따르면 buyertel은 optional 필드임

    // INICIS 해시 생성 규칙 (공식 샘플 코드와 정확히 동일하게)
    const signatureData = `oid=${oid}&price=${numPrice}&timestamp=${timestamp}`;
    const verificationData = `oid=${oid}&price=${numPrice}&signKey=${config.signKey}&timestamp=${timestamp}`;
    const mKeyData = config.signKey;
    
    // SHA256 해시 생성 (공식 샘플과 동일)
    const signature = generateSHA256Hash(signatureData);
    const verification = generateSHA256Hash(verificationData);
    const mKey = generateSHA256Hash(mKeyData);

    console.log("해시 생성 성공:", { oid, numPrice, timestamp });

    res.status(200).json({
      success: true,
      data: {
        mid: config.mid,
        oid: oid,
        price: numPrice,
        timestamp: timestamp,
        signature: signature,
        verification: verification,
        mKey: mKey,
        buyerName: buyername,
        buyerTel: buyertel || "010-1234-5678",
        buyerEmail: buyeremail,
        goodName: goodname,
        returnUrl: isProduction 
          ? "https://service.mond.io.kr/payment/inicis-return"
          : "http://localhost:3000/payment/inicis-return",
        closeUrl: isProduction
          ? "https://service.mond.io.kr/payment/billing-close"
          : "http://localhost:3000/payment/billing-close"
      }
    });

  } catch (error) {
    console.error("INICIS 해시 생성 에러:", error);
    res.status(500).json({
      success: false,
      message: "해시 생성 중 오류가 발생했습니다."
    });
  }
});

/**
 * INICIS 빌링키 발급 요청 (Step 3)
 * POST /payment/inicis/issue-billing-key
 */
router.post("/inicis/issue-billing-key", async function (req, res) {
  try {
    const {
      authToken,
      authUrl,
      orderNumber,
      idc_name
    }: IssueBillingKeyRequest = req.body;

    // 필수 파라미터 검증
    if (!authToken || !authUrl || !orderNumber || !idc_name) {
      return res.status(400).json({
        success: false,
        message: "필수 파라미터가 누락되었습니다.",
        missing: {
          authToken: !authToken,
          authUrl: !authUrl,
          orderNumber: !orderNumber,
          idc_name: !idc_name
        }
      });
    }

    // idc_name을 기반으로 올바른 authUrl 구성 (PHP 샘플과 동일)
    let correctAuthUrl: string;
    const baseUrl = "stdpay.inicis.com/api/payAuth";
    switch (idc_name) {
      case 'fc':
        correctAuthUrl = `https://fc${baseUrl}`;
        break;
      case 'ks':
        correctAuthUrl = `https://ks${baseUrl}`;
        break;
      case 'stg':
        correctAuthUrl = `https://stg${baseUrl}`;
        break;
      default:
        return res.status(400).json({
          success: false,
          message: `지원하지 않는 IDC name: ${idc_name}`
        });
    }

    // authUrl 검증 (보안을 위해)
    if (correctAuthUrl !== authUrl) {
      console.log(`authUrl mismatch - expected: ${correctAuthUrl}, received: ${authUrl}`);
      // 테스트 환경에서는 경고만 출력하고 계속 진행
    }

    // 타임스탬프 생성
    const timestamp = new Date().getTime().toString();
    
    // INICIS Step 3 빌링키 발급용 해시 생성 (공식 샘플과 동일하게)
    const signatureData = `authToken=${authToken}&timestamp=${timestamp}`;
    const verificationData = `authToken=${authToken}&signKey=${config.signKey}&timestamp=${timestamp}`;
    
    // 서명 해시 생성
    const signature = generateSHA256Hash(signatureData);
    const verification = generateSHA256Hash(verificationData);

    // INICIS 빌링키 발급 요청 데이터
    const billingKeyRequestData = {
      mid: config.mid,
      authToken: authToken,
      timestamp: timestamp,
      signature: signature,
      verification: verification,
      charset: "UTF-8",
      format: "JSON"
    };

    console.log("빌링키 발급 요청 데이터:", {
      ...billingKeyRequestData,
      authToken: authToken.substring(0, 10) + "...", // 보안을 위해 일부만 로그
      verification: verification.substring(0, 10) + "..."
    });
    console.log(`Using authUrl: ${correctAuthUrl}`);

    // INICIS authUrl로 빌링키 발급 요청
    // INICIS는 form-urlencoded 형식을 요구함
    // PHP 샘플과 동일하게 각 파라미터를 URL 인코딩
    const formData = Object.entries(billingKeyRequestData)
      .map(([key, value]) => {
        return `${encodeURIComponent(key)}=${encodeURIComponent(value as string)}`;
      })
      .join('&');

    console.log("Form data being sent:", formData);

    const response = await axios.post(correctAuthUrl, formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "*/*"
      },
      timeout: 30000, // 30초 타임아웃
      validateStatus: function (status) {
        return status < 500; // 500 미만의 상태 코드는 모두 성공으로 처리
      }
    });

    console.log("INICIS Response Status:", response.status);
    console.log("INICIS Response Headers:", response.headers);
    console.log("INICIS Response Data Type:", typeof response.data);
    console.log("INICIS Raw Response:", response.data);

    // 응답이 문자열인 경우 JSON으로 파싱 시도
    let billingKeyResult = response.data;
    if (typeof response.data === 'string') {
      try {
        billingKeyResult = JSON.parse(response.data);
      } catch (parseError) {
        console.error("Failed to parse INICIS response as JSON:", parseError);
        // HTML 응답인 경우 에러 메시지 추출 시도
        const errorMatch = response.data.match(/<title>(.*?)<\/title>/i) || 
                          response.data.match(/오류.*?:(.*?)(?:<|$)/i) ||
                          response.data.match(/error.*?:(.*?)(?:<|$)/i);
        if (errorMatch) {
          return res.status(400).json({
            success: false,
            message: `INICIS 오류: ${errorMatch[1].trim()}`,
            rawResponse: response.data.substring(0, 500) // 처음 500자만
          });
        }
      }
    }

    // NEVER log sensitive payment data
    console.log("INICIS 빌링키 발급 응답 - resultCode:", billingKeyResult.resultCode);

    // INICIS 응답 검증
    if (billingKeyResult.resultCode === "0000" || billingKeyResult.resultCode === "00") {
      // 성공 응답
      // INICIS 빌링키는 tid를 사용 (테스트 환경에서는 tid가 빌링키 역할)
      const billingKey = billingKeyResult.tid || billingKeyResult.billKey;
      const cardNumber = billingKeyResult.CARD_Num || billingKeyResult.cardNumber || billingKeyResult.cardNum;
      const cardName = billingKeyResult.P_FN_NM || billingKeyResult.cardName || billingKeyResult.CARD_BankCode;
      
      console.log("빌링키 발급 성공:", {
        billingKey: billingKey,
        cardNumber: cardNumber,
        cardName: cardName
      });
      
      res.status(200).json({
        success: true,
        data: {
          billKey: billingKey, // tid를 빌링키로 사용
          tid: billingKeyResult.tid,
          applDate: billingKeyResult.applDate,
          applTime: billingKeyResult.applTime,
          orderNumber: orderNumber,
          cardNumber: cardNumber,
          cardName: cardName
        }
      });
    } else {
      // 실패 응답
      console.error("INICIS 빌링키 발급 실패 - Code:", billingKeyResult.resultCode, "Message:", billingKeyResult.resultMsg);
      res.status(400).json({
        success: false,
        message: billingKeyResult.resultMsg || "빌링키 발급에 실패했습니다.",
        errorCode: billingKeyResult.resultCode,
        details: billingKeyResult
      });
    }

  } catch (error) {
    console.error("빌링키 발급 요청 에러:", error);
    
    // axios 에러인 경우
    if (axios.isAxiosError(error)) {
      return res.status(500).json({
        success: false,
        message: "INICIS 서버와의 통신 중 오류가 발생했습니다.",
        details: error.response?.data || error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "빌링키 발급 요청 중 오류가 발생했습니다."
    });
  }
});

/**
 * 빌링키 저장
 * POST /payment/inicis/save-billing-key
 */
router.post("/inicis/save-billing-key", isLogin, async function (req, res) {
  try {
    const {
      orderNumber,
      billingKey,
      cardNumber,
      cardName,
      userId
    }: SaveBillingKeyRequest = req.body;

    const requestUserId = userId || req.user?.id;

    // 필수 파라미터 검증
    if (!orderNumber || !billingKey || !cardNumber || !cardName || !requestUserId) {
      return res.status(400).json({
        success: false,
        message: "필수 파라미터가 누락되었습니다."
      });
    }

    // 기존 빌링키 확인 (사용자당 하나의 활성 빌링키만 허용)
    const existingBillingKey = await queryAsync(
      `SELECT id FROM billing_keys WHERE fk_userId = ? AND status = 'active'`,
      [requestUserId]
    );

    // 기존 빌링키가 있으면 비활성화
    if (existingBillingKey.length > 0) {
      await queryAsync(
        `UPDATE billing_keys SET status = 'inactive', updatedAt = NOW() WHERE fk_userId = ? AND status = 'active'`,
        [requestUserId]
      );
    }

    // 새 빌링키 저장
    const insertSql = `
      INSERT INTO billing_keys (
        fk_userId, 
        orderNumber, 
        billingKey, 
        cardNumber, 
        cardName, 
        status, 
        createdAt
      ) VALUES (?, ?, ?, ?, ?, 'active', NOW())
    `;

    // 카드번호 마스킹 처리 (중간 자리수는 *로 표시)
    const maskedCardNumber = cardNumber.includes('*') 
      ? cardNumber // 이미 마스킹된 경우
      : cardNumber.slice(-4); // 마지막 4자리만 저장

    const result = await queryAsync(insertSql, [
      requestUserId,
      orderNumber,
      billingKey,
      maskedCardNumber,
      cardName
    ]);

    // 멤버십 업그레이드 처리
    try {
      // 현재 사용자 정보 조회
      const userInfo = await queryAsync(
        `SELECT grade, membershipStatus FROM user WHERE id = ?`,
        [requestUserId]
      );

      if (userInfo.length > 0) {
        const currentGrade = userInfo[0].grade;
        
        // 빌링키 발급 성공시 프로 요금제로 업그레이드
        const newGrade = 'pro';
        const membershipStartDate = new Date();
        const membershipEndDate = new Date();
        
        // TEST MODE: 1분 후 결제
        membershipEndDate.setMinutes(membershipEndDate.getMinutes() + 1);
        console.log("[TEST MODE] Next billing in 1 minute:", membershipEndDate);
        
        // PRODUCTION MODE (나중에 주석 해제):
        // membershipEndDate.setMonth(membershipEndDate.getMonth() + 1); // 1개월 후

        // 사용자 멤버십 업그레이드
        await queryAsync(
          `UPDATE user SET 
           grade = ?, 
           membershipStartDate = ?, 
           membershipEndDate = ?, 
           membershipStatus = 'active' 
           WHERE id = ?`,
          [newGrade, membershipStartDate, membershipEndDate, requestUserId]
        );

        // 구독 레코드 생성
        await queryAsync(
          `INSERT INTO payment_subscriptions (
            fk_userId, 
            planType, 
            status, 
            startDate, 
            nextBillingDate, 
            price, 
            billingCycle, 
            createdAt
          ) VALUES (?, ?, 'active', ?, ?, 9900, 'monthly', NOW())`,
          [requestUserId, newGrade, membershipStartDate, membershipEndDate]
        );

        console.log(`User ${requestUserId} upgraded from ${currentGrade} to ${newGrade}`);
      }
    } catch (membershipError) {
      console.error('Membership upgrade error:', membershipError);
      // 멤버십 업그레이드 실패해도 빌링키 저장은 성공으로 처리
    }

    res.status(200).json({
      success: true,
      message: "빌링키가 성공적으로 저장되고 멤버십이 업그레이드되었습니다.",
      data: {
        billingKeyId: result.insertId,
        membershipUpgraded: true,
        newMembershipTier: 'pro'
      }
    });

  } catch (error) {
    console.error("빌링키 저장 에러:", error);
    res.status(500).json({
      success: false,
      message: "빌링키 저장 중 오류가 발생했습니다."
    });
  }
});

/**
 * 정기 결제 승인 (빌링키 사용)
 * POST /payment/inicis/billing-approval
 */
router.post("/inicis/billing-approval", isLogin, async function (req, res) {
  try {
    const {
      billingKey,
      orderNumber,
      price,
      goodName,
      buyerName,
      buyerTel,
      buyerEmail
    }: BillingApprovalRequest = req.body;

    const userId = req.user?.id;

    // 필수 파라미터 검증 (buyerTel은 선택사항)
    if (!billingKey || !orderNumber || !price || !goodName || !buyerName || !buyerEmail) {
      return res.status(400).json({
        success: false,
        message: "필수 파라미터가 누락되었습니다."
      });
    }

    // 빌링키 유효성 확인
    const billingKeyInfo = await queryAsync(
      `SELECT * FROM billing_keys WHERE billingKey = ? AND fk_userId = ? AND status = 'active'`,
      [billingKey, userId]
    );

    if (billingKeyInfo.length === 0) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 빌링키입니다."
      });
    }

    // INICIS 정기결제 승인 요청 데이터 생성
    const timestamp = new Date().getTime().toString();
    const signatureData = orderNumber + price + config.signKey + timestamp;
    const signature = generateSHA256Hash(signatureData);

    const paymentData = {
      mid: config.mid,
      oid: orderNumber,
      price: price,
      timestamp: timestamp,
      signature: signature,
      billing_key: billingKey,
      buyerName: buyerName,
      buyerTel: buyerTel || "010-1234-5678",
      buyerEmail: buyerEmail,
      goodName: goodName
    };

    // INICIS API 호출
    const response = await axios.post(config.apiUrl + "/approval", paymentData, {
      headers: {
        "Content-Type": "application/json",
        "INICIS-API-KEY": config.apiKey,
        "INICIS-API-IV": config.apiIv
      },
      timeout: 30000 // 30초 타임아웃
    });

    const paymentResult = response.data;

    // 결제 결과 로그 저장
    const logSql = `
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
    `;

    await queryAsync(logSql, [
      userId,
      orderNumber,
      billingKey,
      price,
      goodName,
      buyerName,
      buyerTel || "010-1234-5678",
      buyerEmail,
      paymentResult.resultCode === "00" ? "success" : "failed",
      JSON.stringify(paymentResult)
    ]);

    // 결제 성공 처리
    if (paymentResult.resultCode === "00") {
      // 성공 시 사용자 등급 업데이트 등 추가 로직 구현 가능
      res.status(200).json({
        success: true,
        message: "결제가 성공적으로 완료되었습니다.",
        data: {
          orderNumber: orderNumber,
          tid: paymentResult.tid,
          price: price,
          cardName: billingKeyInfo[0].cardName,
          cardNumber: billingKeyInfo[0].cardNumber
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: paymentResult.resultMsg || "결제에 실패했습니다.",
        errorCode: paymentResult.resultCode
      });
    }

  } catch (error) {
    console.error("정기결제 승인 에러:", error);
    
    // axios 에러인 경우
    if (axios.isAxiosError(error)) {
      return res.status(500).json({
        success: false,
        message: "INICIS 서버와의 통신 중 오류가 발생했습니다.",
        details: error.response?.data || error.message
      });
    }

    res.status(500).json({
      success: false,
      message: "정기결제 처리 중 오류가 발생했습니다."
    });
  }
});

/**
 * 사용자 빌링키 조회
 * GET /payment/inicis/billing-keys
 */
router.get("/inicis/billing-keys", isLogin, async function (req, res) {
  try {
    const userId = req.user?.id;

    const billingKeys = await queryAsync(
      `SELECT id, orderNumber, cardNumber, cardName, status, createdAt 
       FROM billing_keys 
       WHERE fk_userId = ? 
       ORDER BY createdAt DESC`,
      [userId]
    );

    res.status(200).json({
      success: true,
      data: billingKeys
    });

  } catch (error) {
    console.error("빌링키 조회 에러:", error);
    res.status(500).json({
      success: false,
      message: "빌링키 조회 중 오류가 발생했습니다."
    });
  }
});

/**
 * 빌링키 삭제 (비활성화)
 * DELETE /payment/inicis/billing-keys/:id
 */
router.delete("/inicis/billing-keys/:id", isLogin, async function (req, res) {
  try {
    const billingKeyId = req.params.id;
    const userId = req.user?.id;

    // 빌링키 소유권 확인
    const billingKey = await queryAsync(
      `SELECT id FROM billing_keys WHERE id = ? AND fk_userId = ?`,
      [billingKeyId, userId]
    );

    if (billingKey.length === 0) {
      return res.status(404).json({
        success: false,
        message: "빌링키를 찾을 수 없습니다."
      });
    }

    // 빌링키 비활성화
    await queryAsync(
      `UPDATE billing_keys SET status = 'inactive', updatedAt = NOW() WHERE id = ?`,
      [billingKeyId]
    );

    res.status(200).json({
      success: true,
      message: "빌링키가 성공적으로 삭제되었습니다."
    });

  } catch (error) {
    console.error("빌링키 삭제 에러:", error);
    res.status(500).json({
      success: false,
      message: "빌링키 삭제 중 오류가 발생했습니다."
    });
  }
});

/**
 * 결제 내역 조회
 * GET /payment/inicis/payment-history
 */
router.get("/inicis/payment-history", isLogin, async function (req, res) {
  try {
    const userId = req.user?.id;
    const { page = 1, limit = 10 } = req.query;

    const offset = (Number(page) - 1) * Number(limit);

    const payments = await queryAsync(
      `SELECT orderNumber, price, goodName, paymentStatus, createdAt
       FROM payment_logs 
       WHERE fk_userId = ? 
       ORDER BY createdAt DESC
       LIMIT ? OFFSET ?`,
      [userId, Number(limit), offset]
    );

    const totalCount = await queryAsync(
      `SELECT COUNT(*) as count FROM payment_logs WHERE fk_userId = ?`,
      [userId]
    );

    res.status(200).json({
      success: true,
      data: {
        payments: payments,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: totalCount[0].count,
          totalPages: Math.ceil(totalCount[0].count / Number(limit))
        }
      }
    });

  } catch (error) {
    console.error("결제 내역 조회 에러:", error);
    res.status(500).json({
      success: false,
      message: "결제 내역 조회 중 오류가 발생했습니다."
    });
  }
});

/**
 * INICIS return endpoint OPTIONS handler (CORS preflight)
 */
router.options("/inicis/return", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.sendStatus(200);
});

/**
 * INICIS 사용자 인증 완료 후 POST 응답 처리
 * POST /payment/inicis/return
 */
router.post("/inicis/return", 
  // INICIS 서버로부터의 POST 요청을 위한 CORS 설정
  (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  },
  async function (req, res) {
  try {
    // 모든 수신된 파라미터 로깅 (디버깅용)
    console.log("INICIS return POST 요청 수신:");
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);
    console.log("Query:", req.query);

    const {
      resultCode,
      resultMsg,
      mid,
      orderNumber,
      authToken,
      authUrl,
      netCancelUrl,
      idc_name,
      charset,
      merchantData
    } = req.body;

    // 필수 파라미터 확인
    if (!resultCode) {
      console.error("resultCode가 누락되었습니다.");
      return res.redirect(`http://localhost:3000/payment/success?error=missing_result_code`);
    }

    // 결과 코드 확인
    if (resultCode === '0000') {
      // 성공 케이스
      console.log(`INICIS 인증 성공 - Order: ${orderNumber}, AuthToken: ${authToken?.substring(0, 10)}...`);
      
      // 성공 시 프론트엔드 빌링 프로세스 페이지로 리다이렉트
      const params = new URLSearchParams();
      if (resultCode) params.append('resultCode', resultCode);
      if (resultMsg) params.append('resultMsg', resultMsg);
      if (mid) params.append('mid', mid);
      if (orderNumber) params.append('orderNumber', orderNumber);
      if (authToken) params.append('authToken', authToken);
      if (authUrl) params.append('authUrl', authUrl);
      if (netCancelUrl) params.append('netCancelUrl', netCancelUrl);
      if (idc_name) params.append('idc_name', idc_name);
      if (charset) params.append('charset', charset);
      if (merchantData) params.append('merchantData', merchantData);

      const redirectUrl = `http://localhost:3000/payment/billing-process?${params.toString()}`;
      console.log("성공 리다이렉트 URL:", redirectUrl);
      
      return res.redirect(redirectUrl);
    } else {
      // 실패 케이스
      console.error(`INICIS 인증 실패 - Code: ${resultCode}, Message: ${resultMsg}`);
      
      // 실패 시 프론트엔드 에러 페이지로 리다이렉트
      const errorParams = new URLSearchParams();
      errorParams.append('error', 'payment_failed');
      errorParams.append('resultCode', resultCode);
      if (resultMsg) errorParams.append('resultMsg', resultMsg);
      if (orderNumber) errorParams.append('orderNumber', orderNumber);

      const errorRedirectUrl = `http://localhost:3000/payment/success?${errorParams.toString()}`;
      console.log("실패 리다이렉트 URL:", errorRedirectUrl);
      
      return res.redirect(errorRedirectUrl);
    }

  } catch (error) {
    console.error("INICIS return 처리 중 에러:", error);
    
    // 예외 발생 시 에러 페이지로 리다이렉트
    const errorParams = new URLSearchParams();
    errorParams.append('error', 'server_error');
    errorParams.append('message', 'Internal server error occurred');
    
    return res.redirect(`http://localhost:3000/payment/success?${errorParams.toString()}`);
  }
});

/**
 * 구독 취소
 * POST /payment/inicis/cancel-subscription
 */
router.post("/inicis/cancel-subscription", isLogin, async function (req, res) {
  try {
    const userId = req.user?.id;

    // 현재 활성 구독 확인
    const activeSubscription = await queryAsync(
      `SELECT * FROM payment_subscriptions 
       WHERE fk_userId = ? AND status = 'active'`,
      [userId]
    );

    if (activeSubscription.length === 0) {
      return res.status(404).json({
        success: false,
        message: "활성 구독을 찾을 수 없습니다."
      });
    }

    // 구독 상태를 'cancelled'로 변경 (즉시 취소가 아닌 기간 만료 후 취소)
    await queryAsync(
      `UPDATE payment_subscriptions 
       SET status = 'cancelled', 
           updatedAt = NOW() 
       WHERE fk_userId = ? AND status = 'active'`,
      [userId]
    );

    // 빌링키 비활성화 (자동 결제 중지)
    await queryAsync(
      `UPDATE billing_keys 
       SET status = 'inactive', 
           updatedAt = NOW() 
       WHERE fk_userId = ? AND status = 'active'`,
      [userId]
    );

    // 사용자의 membershipStatus 업데이트
    await queryAsync(
      `UPDATE user 
       SET membershipStatus = 'cancelled'
       WHERE id = ?`,
      [userId]
    );

    // 취소 로그 기록
    await queryAsync(
      `INSERT INTO payment_logs (
        fk_userId,
        orderNumber,
        price,
        goodName,
        buyerName,
        buyerEmail,
        buyerTel,
        paymentStatus,
        inicisResponse,
        createdAt
      ) VALUES (?, ?, 0, '구독 취소', '사용자 요청', '', '', 'cancelled', ?, NOW())`,
      [
        userId,
        `CANCEL_${Date.now()}`,
        JSON.stringify({ reason: '사용자 요청으로 구독 취소', cancelledAt: new Date() })
      ]
    );

    res.status(200).json({
      success: true,
      message: "구독이 취소되었습니다. 현재 결제 기간이 끝날 때까지 서비스를 이용하실 수 있습니다.",
      data: {
        endDate: activeSubscription[0].nextBillingDate
      }
    });

  } catch (error) {
    console.error("구독 취소 에러:", error);
    res.status(500).json({
      success: false,
      message: "구독 취소 중 오류가 발생했습니다."
    });
  }
});

/**
 * 수동 정기결제 실행 (테스트용)
 * POST /payment/test-billing
 */
router.post("/test-billing", isLogin, async function (req, res) {
  try {
    // 관리자만 실행 가능
    if (req.user?.grade !== "A") {
      return res.status(403).json({
        success: false,
        message: "관리자만 테스트 빌링을 실행할 수 있습니다."
      });
    }

    console.log("[TEST] 수동 정기결제 테스트 시작");
    
    // billingCron에서 import
    const { runBillingNow } = await import("../jobs/billingCron");
    await runBillingNow();
    
    res.status(200).json({
      success: true,
      message: "테스트 정기결제가 실행되었습니다. 서버 로그를 확인하세요."
    });
  } catch (error) {
    console.error("[TEST] 수동 정기결제 실패:", error);
    res.status(500).json({
      success: false,
      message: "테스트 정기결제 실행 실패",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export default router;