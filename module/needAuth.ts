// isAdmin.ts
import { Response, NextFunction } from "express";

export function isAdmin(req: any, res: Response, next: NextFunction) {
  const grade = req.user?.grade;
  if (grade !== "A") {
    return res.status(400).json({ message: "관리자가 아닙니다" });
  }
  next();
}

export function isLogin(req: any, res: Response, next: NextFunction) {
  const userId = req.user?.id;
  
  // Debug logging for session issues
  if (!userId) {
    console.log("Auth check failed:", {
      sessionId: req.session?.id,
      user: req.user,
      headers: {
        origin: req.headers.origin,
        cookie: req.headers.cookie ? "Present" : "Missing",
      }
    });
  }
  
  if (!userId) {
    return res.status(400).json({ message: "로그인이 필요합니다." });
  }
  next();
}
