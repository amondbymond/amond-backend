import express from "express";
import dotenv from "dotenv";
dotenv.config();
import { initializePassport } from "./module/passport";
import { setupCors } from "./config/corsConfig";
import { setupExpress } from "./config/expressConfig";
import { setupSession } from "./config/sessionConfig";
import http from "http";
import "./cron/imageRetry";
import { initBillingCron } from "./jobs/billingCron";

const PORT = 9988;
const app = express();

// Trust proxy for production (needed for secure cookies behind reverse proxy)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

setupCors(app); // cors & Helmet 설정 - MUST be first!
setupExpress(app); // express 설정 & rate limit
setupSession(app); // cookie & session 설정
initializePassport(app); // passport 초기화

// Debug middleware for cookie issues
app.use((req, res, next) => {
  const isSafari = req.headers['user-agent']?.includes('Safari') && !req.headers['user-agent']?.includes('Chrome');
  const isIncognito = !req.headers.cookie || req.headers.cookie === '';
  
  // Commented out cookie debug logs
  // if (req.path.includes('/auth/loginCheck') || req.path.includes('/content/project')) {
  //   console.log(`[Cookie Debug] ${req.method} ${req.path}:`, {
  //     origin: req.headers.origin,
  //     cookie: req.headers.cookie ? 'Present' : 'Missing',
  //     sessionID: req.sessionID,
  //     sessionToken: req.headers['x-session-token'] ? 'Present' : 'Missing',
  //     userAgent: isSafari ? 'Safari' : 'Other',
  //     possibleIncognito: isSafari && isIncognito,
  //   });
  // }
  
  // For Safari, we need to ensure the session is saved
  if (isSafari && req.session) {
    req.session.save();
  }
  
  next();
});

// Global auth middleware to check session token
app.use(async (req, res, next) => {
  // Skip if user already authenticated via session
  if (req.user?.id) {
    return next();
  }
  
  // Check for session token in headers
  const sessionToken = req.headers['x-session-token'] as string;
  if (sessionToken) {
    try {
      const { queryAsync } = await import("./module/commonFunction");
      const sql = `SELECT id, grade, authType FROM user 
                   WHERE sessionToken = ? 
                   AND tokenUpdatedAt > DATE_SUB(NOW(), INTERVAL 30 DAY)`;
      const result = await queryAsync(sql, [sessionToken]);
      
      if (result.length > 0) {
        req.user = result[0];
        console.log("[Global Auth] Token authenticated user:", result[0].id);
      }
    } catch (e) {
      console.error("Global session token check error:", e);
    }
  }
  
  next();
});

// 크론 작업 초기화
initBillingCron();

// router
import authRouter from "./router/auth";
import contentRouter from "./router/content";
import adminRouter from "./router/admin";
import paymentRouter from "./router/payment";
import brandRouter from "./router/brand";

app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use("/content", contentRouter);
app.use("/payment", paymentRouter);
app.use("/brand", brandRouter);

app.get("/", (req, res) => {
  res.status(200).send("OK");
});

// Session debug endpoint
app.get("/session-debug", (req, res) => {
  console.log("Session Debug Request:", {
    headers: req.headers,
    sessionID: req.sessionID,
    session: req.session,
    cookies: req.cookies,
  });
  
  res.json({
    sessionId: req.session?.id,
    userId: req.user?.id,
    isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : false,
    sessionData: req.session,
    cookies: req.headers.cookie,
    origin: req.headers.origin,
    secure: req.secure,
    protocol: req.protocol,
  });
});

// Debug endpoint to check CORS
app.get("/cors-test", (req, res) => {
  console.log("CORS Test - Origin:", req.headers.origin);
  console.log("CORS Test - Headers:", req.headers);
  res.json({ 
    message: "CORS test endpoint",
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

// 서버 실행
http.createServer(app).listen(PORT, () => {
  console.log(`Server is running at port ${PORT} - Updated ${new Date().toISOString()}`);
});
