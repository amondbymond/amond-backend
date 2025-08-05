import passport from "passport";
import { Strategy as KakaoStrategy } from "passport-kakao";
import dotenv from "dotenv";
import { crpytoSameResult, queryAsync, transEncrypt } from "../commonFunction";
dotenv.config();

const callbackUrl =
  process.env.NODE_ENV === "production"
    ? "https://api.mond.io.kr/auth/kakao/callback"
    : "http://localhost:9988/auth/kakao/callback";

export default () => {
  passport.use(
    new KakaoStrategy(
      {
        clientID: process.env.KAKAO_REST_API as string,
        callbackURL: callbackUrl, // 애플리케이션을 등록할 때 입력했던 callbackURL 을 입력해준다.
      },

      async (accessToken: any, refreshToken: any, profile: any, done: any) => {
        // console.log(profile);
        const sql = `SELECT id, grade, authType FROM user WHERE authType = "카카오" && socialId = "${profile.id}"`;

        try {
          const result = await queryAsync(sql, [profile.id]);

          if (result.length === 0) {
            const { id } = profile;
            const email = profile._json.kakao_account?.email || null;
            const nickname = profile._json.properties?.nickname || profile.displayName;
            const name = nickname || email?.split('@')[0] || '카카오 사용자';
            const emailDuplicate = email ? await crpytoSameResult(email) : null;
            const encryptedEmail = email ? await transEncrypt(email) : null;

            const sql = `INSERT INTO user(authType, email, socialId, emailDuplicate, name, grade, lastLoginAt, createdAt)
              VALUES("카카오", ?, ?, ?, ?, "basic", NOW(), NOW());`;
            const result = await queryAsync(sql, [
              encryptedEmail,
              id,
              emailDuplicate,
              name,
            ]);

            return done(null, {
              id: result.insertId,
              grade: "basic",
              authType: "카카오",
            } as any);
          } else {
            const updateSql = `UPDATE user SET lastLoginAt = NOW() WHERE id = ?`;
            await queryAsync(updateSql, [result[0].id]);

            return done(null, {
              id: result[0].id,
              grade: result[0].grade,
              authType: result[0].authType,
            } as any);
          }
        } catch (e) {
          console.error(e);
          return done(null, false, { message: "카카오 로그인 실패" });
        }
      }
    )
  );
};
