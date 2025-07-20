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

setupCors(app); // cors & Helmet 설정 - MUST be first!
setupExpress(app); // express 설정 & rate limit
setupSession(app); // cookie & session 설정
initializePassport(app); // passport 초기화

// 크론 작업 초기화
initBillingCron();

// router
import authRouter from "./router/auth";
import contentRouter from "./router/content";
import adminRouter from "./router/admin";
import paymentRouter from "./router/payment";

app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use("/content", contentRouter);
app.use("/payment", paymentRouter);

app.get("/", (req, res) => {
  res.status(200).send("OK");
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
