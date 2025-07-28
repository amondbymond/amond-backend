import session from "express-session";
import express from "express";
import dotenv from "dotenv";
dotenv.config();
import cookieParser from "cookie-parser";
import { RedisStore } from "connect-redis";
import { createClient } from "redis";

const redisClient = createClient();
redisClient.connect().catch(console.error);
const redisStore = new RedisStore({
  client: redisClient,
  prefix: "mond:",
  ttl: 60 * 60 * 24 * 30, // 30일 후에 만료
});

export const redisClientExport = redisClient;

export const setupSession = (app: express.Express) => {
  app.use(cookieParser());

  app.use(
    session({
      secret: process.env.SESSION_SECRET as string,
      resave: false,
      saveUninitialized: true, // Allow saving uninitialized sessions for incognito mode
      store: redisStore,
      cookie: {
        // maxAge: 10 * 1000,
        maxAge: 60 * 60 * 1000 * 24 * 30, // 30일
        httpOnly: true, // JavaScript를 통한 쿠키 접근 방지
        secure: process.env.NODE_ENV === "production" ? true : false, // HTTPS를 사용하는 경우에만 쿠키를 전송
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // Cross-domain cookies
        // Don't set domain to allow cookies to work across different domains
        // domain is not set to allow cross-origin cookies with SameSite=none
      },
    })
  );
};
