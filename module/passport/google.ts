import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import dotenv from "dotenv";
import { crpytoSameResult, queryAsync, transEncrypt } from "../commonFunction";
dotenv.config();

const callbackUrl =
  process.env.NODE_ENV === "production"
    ? "https://api.mond.io.kr/auth/google/callback"
    : "http://localhost:9988/auth/google/callback";

export default () => {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        callbackURL: callbackUrl,
      },
      async (accessToken: any, refreshToken: any, profile: any, done: any) => {
        const sql = `SELECT id, grade, authType FROM user WHERE authType = "구글" && socialId = "${profile.id}"`;
        // console.log(profile);

        try {
          const result = await queryAsync(sql, [profile.id]);

          if (result.length === 0) {
            const { id } = profile;
            const email = profile.emails[0]?.value || null;

            const emailDuplicate = email ? await crpytoSameResult(email) : null;
            const encryptedEmail = email ? await transEncrypt(email) : null;

            const sql = `INSERT INTO user(authType, email, socialId, emailDuplicate, grade, lastLoginAt, createdAt)
              VALUES("구글", ?, ?, ?, "basic", NOW(), NOW());`;
            const result = await queryAsync(sql, [
              encryptedEmail,
              id,
              emailDuplicate,
            ]);

            return done(null, {
              id: result.insertId,
              grade: "basic",
              authType: "구글",
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
          return done(null, false, { message: "구글 로그인 실패" });
        }
      }
    )
  );
};
