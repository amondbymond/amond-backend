import express from "express";
import passport from "passport";
import kakao from "./kakao";
import google from "./google";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import { ReqUser } from "../../@types";
import { crpytoSameResult, queryAsync } from "../commonFunction";

// Passport 초기화 및 세션 설정 함수
export const initializePassport = (app: express.Express) => {
  app.use(passport.initialize());
  app.use(passport.session());
};

passport.serializeUser(function (user: ReqUser, done) {
  // 첫 로그인
  // console.log("serializeUser", user);
  done(null, user.id);
});

// 클라이언트 요청 있을 때 마다 호출하여 req.user에 담을 것 여기서 정하는 / 클라이언트 보내는 것과 관계 X!
passport.deserializeUser(async function (userId, done) {
  let sql = `SELECT id, grade FROM user WHERE id = ?`;

  try {
    const result = await queryAsync(sql, [userId]);
    done(null, result[0]);
  } catch (e) {
    console.error(`[로그인] deserializeUser Error\n${e}`);
    done(e);
  }
  await queryAsync(sql, [userId]);
});

passport.use(
  new LocalStrategy(
    {
      session: true,
      usernameField: "email",
      passwordField: "password",
      // req도 받을 것인지
      passReqToCallback: true,
    },
    async function (req, email, password, done) {
      const emailDuplicate = await crpytoSameResult(email);
      const sql =
        "SELECT id, grade, emailDuplicate, authType,password FROM user WHERE emailDuplicate = ? && authType = '이메일'";

      try {
        const result = await queryAsync(sql, [emailDuplicate]);
        if (result.length === 0) {
          return done(null, false, { message: "이메일을 다시 확인해주세요!" });
        }

        bcrypt.compare(password, result[0].password, (err, passResult) => {
          if (passResult) {
            return done(null, {
              id: result[0].id,
              grade: result[0].grade,
              authType: result[0].authType,
            } as any);
          } else {
            return done(null, false, {
              message: "비밀번호를 다시 확인해주세요!",
            });
          }
        });
      } catch (e) {
        console.error(`[로그인] LocalStrategy Error\n${e}`);
        return done(e);
      }
    }
  )
);

kakao();
google();

export default passport;
