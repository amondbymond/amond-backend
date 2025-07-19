import express from "express";
import { rateLimit } from "express-rate-limit";

// 비정상적 접근 차단 (DDOS & 무한 요청 등)
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1분
  max: 100, // 1분에 100번까지 요청 가능s
  message: "너무 많은 요청을 보냈습니다. 잠시 후 다시 시도해주세요.",
});

export const setupExpress = (app: express.Express) => {
  app.use(express.urlencoded({ extended: false }));
  app.use(
    express.json({
      limit: "20mb",
    })
  );

  app.use(limiter); // 검색 라우트에 rate limit 적용

  // 쿠키 안되서 찾아본 trust proxy
  app.set("trust proxy", 1);
};
