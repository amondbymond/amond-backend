import express from "express";
import cors from "cors";
import helmet from "helmet";

const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://www.mond.io.kr",
    "https://mond.io.kr",
    "https://app.mond.io.kr",
    "https://service.mond.io.kr",
    // AWS Amplify domains
    "https://main.dpvdj8dsmc7us.amplifyapp.com",
    "https://dpvdj8dsmc7us.amplifyapp.com",
    // INICIS 결제 도메인들
    "https://stgstdpay.inicis.com",
    "https://stdpay.inicis.com",
    "https://mobile.inicis.com",
    "https://stgmobile.inicis.com"
  ],
  credentials: true,
};

export const setupCors = (app: express.Express) => {
  app.use(cors(corsOptions));

  app.use(helmet.xssFilter());
  app.use(
    helmet.contentSecurityPolicy({
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://www.google-analytics.com"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "https://www.google-analytics.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        // 다른 지시문들도 필요에 따라 추가
      },
    })
  );
};
