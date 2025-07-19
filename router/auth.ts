import express from "express";
import {
  crpytoSameResult,
  decodeHashId,
  queryAsync,
  sendGmail,
  transDecrypt,
  transEncrypt,
} from "../module/commonFunction";
import passport from "../module/passport/index";
import bcrypt from "bcrypt";
import { saltRounds } from "../module/constant";
import dotenv from "dotenv";
dotenv.config();
const router = express.Router();
import { isLogin } from "../module/needAuth";

const failUrl =
  process.env.NODE_ENV === "production"
    ? "https://service.mond.io.kr/login"
    : "http://localhost:3000/login";

const successUrl =
  process.env.NODE_ENV === "production"
    ? "https://service.mond.io.kr/login/success"
    : "http://localhost:3000/login/success";

// ㅇ 유저
// 이메일 가입
router.post("/register/email", async function (req, res) {
  const { email, password } = req.body;

  const emailDuplicate = await crpytoSameResult(email);
  const isEmailDuplicate = await queryAsync(
    `SELECT authType FROM user WHERE emailDuplicate = ? && authType = "이메일"`,
    [emailDuplicate]
  );

  if (isEmailDuplicate.length !== 0) {
    return res.status(400).json({
      message: `이미 가입된 이메일입니다`,
    });
  }

  const encryptedEmail = await transEncrypt(email);
  // console.log(encryptedEmail);
  // 정상 가입
  bcrypt.hash(password, saltRounds, async (error, hash) => {
    const sql = `INSERT INTO user(authType, email, password, emailDuplicate, grade, createdAt)
      VALUES("이메일", ?, ?, ?, "basic", NOW());`;

    try {
      await queryAsync(sql, [encryptedEmail, hash, emailDuplicate]);
      res.status(200).json("회원가입이 정상적으로 완료되었습니다!");
    } catch (e) {
      console.error(e);
      res
        .status(500)
        .json("회원가입 중 에러가 발생하였습니다! (Interner Server Error)");
    }
  });
});

// 이메일 로그인
router.post("/login/email", (req: any, res, next) => {
  passport.authenticate(
    "local",
    // user는 userId
    (err: Error, user: { id: number }, info?: { message: string }) => {
      if (err) {
        console.error(err);
        return next(err);
      }

      if (info?.message) {
        return res.status(401).json(info.message);
      }

      return req.login(user, async (loginErr: Error) => {
        if (loginErr) {
          console.error(err);
          return next(loginErr);
        }

        if (req.body.autoLogin) {
          req.session.cookie.maxAge = 60 * 60 * 1000 * 24 * 30; // 30일
        } else {
          req.session.cookie.maxAge = 60 * 60 * 1000 * 24 * 1; // 1일
        }

        // 로그인 성공 후 전달할 데이터 (로그인 시, user 데이터 적용 하도록)
        const sql = `SELECT id, authType, grade FROM user WHERE id = "${user.id}"`;
        try {
          const result = await queryAsync(sql, [user.id]);
          return res.status(200).json(result[0]);
        } catch (e) {
          console.error(e);
          res.status(500).json({ error: e });
        }
      });
    }
  )(req, res, next);
});

// 카카오 로그인
router.get("/login/kakao", passport.authenticate("kakao"));

// 카카오 콜백
router.get(
  "/kakao/callback",
  passport.authenticate("kakao", {
    failureRedirect: failUrl,
    successRedirect: successUrl,
  })
);

// 구글 로그인
router.get(
  "/login/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// 구글 콜백
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: failUrl,
    successRedirect: successUrl,
  })
);

// 로그인 상태인지 체크
router.get("/loginCheck", async function (req, res) {
  const userId = req.user?.id;

  if (userId) {
    try {
      const updateSql = `UPDATE user SET lastLoginAt = NOW() WHERE id = ?`;
      await queryAsync(updateSql, [userId]);

      const sql = `SELECT id, grade, authType FROM user WHERE id = "${userId}"`;
      const result = await queryAsync(sql, [userId]);
      return res.status(200).json(result[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e });
    }
  } else {
    res.status(200).json({ id: null, status: null });
  }
});

// 사용자 정보 조회
router.get("/user", isLogin, async function (req, res) {
  const userId = req.user?.id;

  try {
    // 사용자 정보 조회 (민감한 정보 제외)
    const sql = `
      SELECT 
        id,
        authType,
        email,
        CASE 
          WHEN email IS NOT NULL THEN 
            SUBSTRING_INDEX(email, '@', 1) 
          ELSE 
            CONCAT('user_', id)
        END as name,
        grade,
        membershipStartDate,
        membershipEndDate,
        membershipStatus,
        createdAt,
        lastLoginAt
      FROM user 
      WHERE id = ?
    `;
    
    const result = await queryAsync(sql, [userId]);
    
    if (result.length === 0) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }

    // 이메일 복호화 처리
    const userData = result[0];
    if (userData.email) {
      try {
        userData.email = await transDecrypt(userData.email);
      } catch (decryptError) {
        console.error("Email decryption error:", decryptError);
        // 복호화 실패시 이메일을 숨김 처리
        userData.email = userData.email.substring(0, 3) + "***@***.***";
      }
    }

    return res.status(200).json(userData);
  } catch (e) {
    console.error("User fetch error:", e);
    res.status(500).json({ message: "사용자 정보 조회 중 오류가 발생했습니다." });
  }
});

// 비밀번호 변경
router.put("/changePassword", isLogin, async function (req, res) {
  const { password } = req.body;
  const userId = req.user?.id;

  const encryptedPassword = await bcrypt.hash(password, saltRounds);

  try {
    const sql = `UPDATE user SET password = ? WHERE id = ?`;
    const sqlValues = [encryptedPassword, userId];
    await queryAsync(sql, sqlValues);
    res.status(200).send({ message: "비밀번호 변경 성공" });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "비밀번호 변경 실패" });
  }
});

// 로그아웃
router.post("/logout", function (req, res) {
  req.logout(function (err) {
    if (err) {
      res
        .status(500)
        .json({ error: "로그아웃 중 에러가 발생하였습니다" + err.message });
      console.error(err);
    }

    req.session.destroy(function () {
      res.clearCookie("connect.sid");
      res.status(200).json("성공적으로 로그아웃되었습니다.");
    });
  });
});

// 비밀번호 찾기
router.post("/findPassword", async function (req, res) {
  const { email } = req.body;

  const searchEmail = await crpytoSameResult(email);

  try {
    const sql = `SELECT id, email FROM user WHERE emailDuplicate = ? && authType = "이메일"`;
    const sqlValues = [searchEmail];
    const result = await queryAsync(sql, sqlValues);

    if (result.length === 0) {
      res.status(400).json({ message: "이메일을 확인해주세요!" });
    } else {
      const random5Number1 = Math.floor(10000 + Math.random() * 90000);
      const random5Number2 = Math.floor(10000 + Math.random() * 90000);
      const tempPassword = `${random5Number1}${random5Number2}`;

      const bcryptPassword = await bcrypt.hash(tempPassword, saltRounds);

      const passSql = `UPDATE user SET password = ? WHERE id = ?`;
      const passSqlValues = [bcryptPassword, result[0].id];

      await queryAsync(passSql, passSqlValues);

      const htmlDescription = `
      <!DOCTYPE html>
        <html lang="ko">
          <head>
            <meta charset="UTF-8" />
            <title>Amond</title>
            <style>
              @import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard-dynamic-subset.css");
            </style>
          </head>
          <body
            style="font-family: 'Pretendard', '-apple-system'; box-sizing: border-box"
          >
            <table
              style="
                width: 100%;
                max-width: 480px;
                max-height: 583px;
                margin: 0 auto;
                padding-top: 70px;
                padding-bottom: 50px;
              "
            >
              <tr>
                <td>
                  <div style="text-align: center">
                    <a href="https://mond.io.kr" target="_blank">
                      <img
                        src="https://mond.io.kr/logo.png"
                        alt="Logo"
                        style="width: 100px; height: 100px"
                      />
                    </a>
                  </div>
                  <div
                    style="
                      border: 1px solid #e6e6e6;
                      border-radius: 8px;
                      padding: 32px;
                      margin-top: 24px;
                    "
                  >
                    <h1
                      style="
                        font-size: 20px;
                        font-weight: 600;
                        color: #4d4d4d;
                        margin: 0;
                      "
                    >
                      임시 비밀번호가 설정되었습니다.
                    </h1>
                    <p
                      style="
                        font-size: 14px;
                        color: #4d4d4d;
                        margin-top: 10px;
                        line-height: 140%;
                        margin-bottom: 15px;
                      "
                    >
                      임시 비밀번호 : ${tempPassword}
                      <br />
                    </p>
                  </div>

                  <p
                    style="
                      text-align: center;
                      font-size: 12px;
                      margin-top: 16px;
                      margin-bottom: 6px;
                      color: #999999;
                    "
                  >
                    <a
                      href="mailto:service@mond.io.kr"
                      style="color: #999999; text-decoration: none"
                      >service@mond.io.kr</a
                    >
                  </p>
                  <p style="text-align: center; font-size: 12px; color: #BBBBBB">
                    © 아몬드. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </body>
        </html>`;

      await sendGmail({
        to: await transDecrypt(result[0].email),
        title: "[아몬드] 임시 비밀번호 발송",
        htmlDescription,
      });

      // console.log(tempPassword);

      res.status(200).send({ message: "임시 비밀번호 발송" });
    }
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "비밀번호 찾기 실패" });
  }
});

// 비밀번호 변경
router.put("/changePassword", isLogin, async function (req, res) {
  const { password } = req.body;
  const userId = req.user?.id;

  try {
    const encryptedPassword = await bcrypt.hash(password, saltRounds);
    const sql = `UPDATE user SET password = ? WHERE id = ?`;
    const sqlValues = [encryptedPassword, userId];
    await queryAsync(sql, sqlValues);
    res.status(200).send({ message: "비밀번호 변경 성공" });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "비밀번호 변경 실패" });
  }
});

export default router;
