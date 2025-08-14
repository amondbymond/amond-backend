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

// Get the frontend URL from environment variable or use default
const frontendUrl = process.env.FRONTEND_URL || 
  (process.env.NODE_ENV === "production" 
    ? "https://mond.io.kr/service" 
    : "http://localhost:3000/service");

const failUrl = `${frontendUrl}/login`;
const successUrl = `${frontendUrl}/login/success`;

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
    // Extract name from email (part before @)
    const userName = email.split('@')[0];
    
    const sql = `INSERT INTO user(authType, email, password, emailDuplicate, name, grade, createdAt)
      VALUES("이메일", ?, ?, ?, ?, "basic", NOW());`;

    try {
      await queryAsync(sql, [encryptedEmail, hash, emailDuplicate, userName]);
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

        console.log("[Email Login] Login successful:", {
          userId: user.id,
          sessionId: req.session?.id,
          cookie: req.headers.cookie ? 'Present' : 'Missing',
          userAgent: req.headers['user-agent']?.includes('Safari') ? 'Safari' : 'Other',
        });

        // Force session save for incognito mode
        req.session.save((saveErr: any) => {
          if (saveErr) {
            console.error("[Email Login] Session save error:", saveErr);
          }
        });

        // Generate a session token for incognito mode fallback
        const sessionToken = req.sessionID; // Use session ID as token
        
        // Store the session token with user mapping
        const tokenSql = `UPDATE user SET sessionToken = ?, tokenUpdatedAt = NOW() WHERE id = ?`;
        await queryAsync(tokenSql, [sessionToken, user.id]);

        // 로그인 성공 후 전달할 데이터 (로그인 시, user 데이터 적용 하도록)
        const sql = `SELECT id, authType, grade FROM user WHERE id = "${user.id}"`;
        try {
          const result = await queryAsync(sql, [user.id]);
          // Include session token in response for incognito mode
          return res.status(200).json({
            ...result[0],
            sessionToken: sessionToken
          });
        } catch (e) {
          console.error(e);
          res.status(500).json({ error: e });
        }
      });
    }
  )(req, res, next);
});

// 카카오 로그인
router.get("/login/kakao", (req, res, next) => {
  // Pass returnTo parameter through the OAuth flow
  const returnTo = req.query.returnTo as string;
  const state = returnTo ? Buffer.from(JSON.stringify({ returnTo })).toString('base64') : undefined;
  
  passport.authenticate("kakao", { state })(req, res, next);
});

// 카카오 콜백
router.get(
  "/kakao/callback",
  (req, res, next) => {
    passport.authenticate("kakao", async (err: Error, user: { id: number }) => {
      if (err) {
        console.error(err);
        return res.redirect(failUrl);
      }

      if (!user) {
        return res.redirect(failUrl);
      }

      req.login(user, async (loginErr: Error) => {
        if (loginErr) {
          console.error(loginErr);
          return res.redirect(failUrl);
        }

        // Generate a session token for incognito mode
        const sessionToken = req.sessionID;
        
        // Store the session token with user mapping
        try {
          const tokenSql = `UPDATE user SET sessionToken = ?, tokenUpdatedAt = NOW() WHERE id = ?`;
          await queryAsync(tokenSql, [sessionToken, user.id]);
          
          // Force session save for incognito mode
          req.session.save((saveErr: any) => {
            if (saveErr) {
              console.error("[Kakao Login] Session save error:", saveErr);
            }
          });

          // Redirect with session token as query parameter for incognito mode
          const redirectUrl = new URL(successUrl);
          redirectUrl.searchParams.set('sessionToken', sessionToken);
          
          // Pass through returnTo parameter if it exists in state
          const state = req.query.state as string;
          if (state) {
            try {
              const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
              if (stateData.returnTo) {
                redirectUrl.searchParams.set('returnTo', stateData.returnTo);
              }
            } catch (e) {
              console.error("Failed to parse state parameter:", e);
            }
          }
          
          return res.redirect(redirectUrl.toString());
        } catch (e) {
          console.error("Failed to save session token:", e);
          return res.redirect(successUrl);
        }
      });
    })(req, res, next);
  }
);

// 구글 로그인
router.get("/login/google", (req, res, next) => {
  // Pass returnTo parameter through the OAuth flow
  const returnTo = req.query.returnTo as string;
  const state = returnTo ? Buffer.from(JSON.stringify({ returnTo })).toString('base64') : undefined;
  
  passport.authenticate("google", { 
    scope: ["profile", "email"],
    state 
  })(req, res, next);
});

// 구글 콜백
router.get(
  "/google/callback",
  (req, res, next) => {
    passport.authenticate("google", async (err: Error, user: { id: number }) => {
      if (err) {
        console.error(err);
        return res.redirect(failUrl);
      }

      if (!user) {
        return res.redirect(failUrl);
      }

      req.login(user, async (loginErr: Error) => {
        if (loginErr) {
          console.error(loginErr);
          return res.redirect(failUrl);
        }

        // Generate a session token for incognito mode
        const sessionToken = req.sessionID;
        
        // Store the session token with user mapping
        try {
          const tokenSql = `UPDATE user SET sessionToken = ?, tokenUpdatedAt = NOW() WHERE id = ?`;
          await queryAsync(tokenSql, [sessionToken, user.id]);
          
          // Force session save for incognito mode
          req.session.save((saveErr: any) => {
            if (saveErr) {
              console.error("[Google Login] Session save error:", saveErr);
            }
          });

          // Redirect with session token as query parameter for incognito mode
          const redirectUrl = new URL(successUrl);
          redirectUrl.searchParams.set('sessionToken', sessionToken);
          
          // Pass through returnTo parameter if it exists in state
          const state = req.query.state as string;
          if (state) {
            try {
              const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
              if (stateData.returnTo) {
                redirectUrl.searchParams.set('returnTo', stateData.returnTo);
              }
            } catch (e) {
              console.error("Failed to parse state parameter:", e);
            }
          }
          
          return res.redirect(redirectUrl.toString());
        } catch (e) {
          console.error("Failed to save session token:", e);
          return res.redirect(successUrl);
        }
      });
    })(req, res, next);
  }
);

// 로그인 상태인지 체크
router.get("/loginCheck", async function (req, res) {
  let userId = req.user?.id;
  const sessionToken = req.headers['x-session-token'] as string;
  
  // Commented out login check debug logs
  // console.log("[loginCheck] Session check:", {
  //   sessionId: req.session?.id,
  //   userId: userId,
  //   sessionToken: sessionToken ? 'Present' : 'Missing',
  //   isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : false,
  //   origin: req.headers.origin,
  //   userAgent: req.headers['user-agent']?.includes('Safari') ? 'Safari' : 'Other',
  //   cookie: req.headers.cookie ? 'Present' : 'Missing',
  // });
  
  // If no userId from session, check for session token
  if (!userId && sessionToken) {
    try {
      // Check if name column exists first
      const columnCheckSql = `
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'user' 
        AND COLUMN_NAME = 'name'
        AND TABLE_SCHEMA = DATABASE()
      `;
      
      const columnExists = await queryAsync(columnCheckSql, []);
      const hasNameColumn = columnExists.length > 0;
      
      const tokenSql = hasNameColumn 
        ? `SELECT id, grade, authType, name FROM user 
           WHERE sessionToken = ? 
           AND tokenUpdatedAt > DATE_SUB(NOW(), INTERVAL 30 DAY)`
        : `SELECT id, grade, authType FROM user 
           WHERE sessionToken = ? 
           AND tokenUpdatedAt > DATE_SUB(NOW(), INTERVAL 30 DAY)`;
      const tokenResult = await queryAsync(tokenSql, [sessionToken]);
      
      if (tokenResult.length > 0) {
        userId = tokenResult[0].id;
        console.log("[loginCheck] Token authenticated user:", userId);
      }
    } catch (e) {
      console.error("Session token check error:", e);
    }
  }

  if (userId) {
    try {
      const updateSql = `UPDATE user SET lastLoginAt = NOW() WHERE id = ?`;
      await queryAsync(updateSql, [userId]);

      // Check if name column exists
      const columnCheckSql = `
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'user' 
        AND COLUMN_NAME = 'name'
        AND TABLE_SCHEMA = DATABASE()
      `;
      
      const columnExists = await queryAsync(columnCheckSql, []);
      const hasNameColumn = columnExists.length > 0;
      
      const sql = hasNameColumn 
        ? `SELECT id, grade, authType, name FROM user WHERE id = ?`
        : `SELECT id, grade, authType FROM user WHERE id = ?`;
      const result = await queryAsync(sql, [userId]);
      
      // Include session token for incognito mode support
      const userData = result[0];
      if (!sessionToken && req.sessionID) {
        // Update session token in database
        const tokenSql = `UPDATE user SET sessionToken = ?, tokenUpdatedAt = NOW() WHERE id = ?`;
        await queryAsync(tokenSql, [req.sessionID, userId]);
        userData.sessionToken = req.sessionID;
      }
      
      return res.status(200).json(userData);
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
  console.log("[/auth/user] Request user:", req.user);
  const userId = req.user?.id;

  try {
    // 사용자 정보 조회 (민감한 정보 제외)
    // First, check if name column exists
    const columnCheckSql = `
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'user' 
      AND COLUMN_NAME = 'name'
      AND TABLE_SCHEMA = DATABASE()
    `;
    
    const columnExists = await queryAsync(columnCheckSql, []);
    const hasNameColumn = columnExists.length > 0;
    
    // Build SQL query based on column existence
    const sql = hasNameColumn ? `
      SELECT 
        id,
        authType,
        email,
        name,
        grade,
        membershipStartDate,
        membershipEndDate,
        membershipStatus,
        createdAt,
        lastLoginAt
      FROM user 
      WHERE id = ?
    ` : `
      SELECT 
        id,
        authType,
        email,
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

    // 이메일 복호화 처리 및 name 생성
    const userData = result[0];
    
    console.log("[/auth/user] Raw user data from DB:", {
      id: userData.id,
      name: userData.name,
      hasNameColumn: hasNameColumn,
      authType: userData.authType
    });
    
    // If name column exists and has a value, use it
    if (hasNameColumn && userData.name) {
      // Name exists in database, just decrypt email if present
      if (userData.email) {
        try {
          userData.email = await transDecrypt(userData.email);
        } catch (decryptError) {
          console.error("Email decryption error:", decryptError);
          userData.email = userData.email.substring(0, 3) + "***@***.***";
        }
      }
    } else {
      // Generate name based on email or authType
      if (userData.email) {
        try {
          userData.email = await transDecrypt(userData.email);
          // Extract username from email
          userData.name = userData.email.split('@')[0];
        } catch (decryptError) {
          console.error("Email decryption error:", decryptError);
          // 복호화 실패시 이메일을 숨김 처리
          userData.email = userData.email.substring(0, 3) + "***@***.***";
          userData.name = `user_${userData.id}`;
        }
      } else {
        // 소셜 로그인 사용자
        if (userData.authType === '카카오') {
          userData.name = '카카오 사용자';
        } else if (userData.authType === '구글') {
          userData.name = '구글 사용자';
        } else {
          userData.name = `${userData.authType || '이메일'} 사용자`;
        }
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
router.post("/logout", async function (req, res) {
  const userId = req.user?.id;
  
  // Clear session token from database
  if (userId) {
    try {
      const sql = `UPDATE user SET sessionToken = NULL, tokenUpdatedAt = NULL WHERE id = ?`;
      await queryAsync(sql, [userId]);
    } catch (e) {
      console.error("Failed to clear session token:", e);
    }
  }
  
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
                    <a href="https://mond.io.kr/service" target="_blank">
                      <img
                        src="https://mond.io.kr/service/logo.png"
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

// 프로필 정보 가져오기
router.get("/profile", isLogin, async function (req, res) {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: "로그인이 필요합니다" });
  }

  try {
    // Check if name column exists
    const columnCheckSql = `
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'user' 
      AND COLUMN_NAME = 'name'
      AND TABLE_SCHEMA = DATABASE()
    `;
    
    const columnExists = await queryAsync(columnCheckSql, []);
    const hasNameColumn = columnExists.length > 0;
    
    const sql = hasNameColumn ? 
      `SELECT id, authType, grade, name, email, createdAt, lastLoginAt, 
              membershipStatus, membershipStartDate, membershipEndDate 
       FROM user WHERE id = ?` :
      `SELECT id, authType, grade, email, createdAt, lastLoginAt, 
              membershipStatus, membershipStartDate, membershipEndDate 
       FROM user WHERE id = ?`;
       
    const result = await queryAsync(sql, [userId]);
    
    if (result.length === 0) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다" });
    }
    
    const userData = result[0];
    
    // If name column doesn't exist or is empty, generate it
    if (!hasNameColumn || !userData.name) {
      if (userData.email) {
        try {
          const decryptedEmail = await transDecrypt(userData.email);
          userData.name = decryptedEmail.split('@')[0];
          userData.email = decryptedEmail;
        } catch (decryptError) {
          console.error("Email decryption error:", decryptError);
          userData.name = `user_${userData.id}`;
          userData.email = userData.email.substring(0, 3) + "***@***.***";
        }
      } else {
        // Social login users
        if (userData.authType === '카카오') {
          userData.name = '카카오 사용자';
        } else if (userData.authType === '구글') {
          userData.name = '구글 사용자';
        } else {
          userData.name = `${userData.authType || '이메일'} 사용자`;
        }
      }
    } else {
      // Decrypt email if exists
      if (userData.email) {
        try {
          userData.email = await transDecrypt(userData.email);
        } catch (decryptError) {
          console.error("Email decryption error:", decryptError);
          userData.email = userData.email.substring(0, 3) + "***@***.***";
        }
      }
    }
    
    res.status(200).json(userData);
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "프로필 정보 조회 실패" });
  }
});

export default router;
