import express from "express";
import cors from "cors";
import helmet from "helmet";

const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    const allowedOrigins = [
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
    ];
    
    // Add FRONTEND_URL if it exists
    if (process.env.FRONTEND_URL) {
      allowedOrigins.push(process.env.FRONTEND_URL);
    }
    
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    // Check exact match
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } 
    // Check for Amplify wildcard domains
    else if (origin.match(/^https:\/\/[a-z0-9-]+\.dpvdj8dsmc7us\.amplifyapp\.com$/)) {
      callback(null, true);
    } 
    else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cookie'],
  exposedHeaders: ['set-cookie'],
};

export const setupCors = (app: express.Express) => {
  // Enable pre-flight requests for all routes
  app.options('*', cors(corsOptions));
  
  // Apply CORS to all routes
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
