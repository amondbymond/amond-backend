// isAdmin.ts
import { Response, NextFunction } from "express";
import { queryAsync } from "../module/commonFunction";

export function isAdmin(req: any, res: Response, next: NextFunction) {
  const grade = req.user?.grade;
  if (grade !== "A") {
    return res.status(400).json({ message: "관리자가 아닙니다" });
  }
  next();
}

export async function isLogin(req: any, res: Response, next: NextFunction) {
  let userId = req.user?.id;
  
  // If no userId from session, check for session token in headers
  if (!userId) {
    const sessionToken = req.headers['x-session-token'];
    
    if (sessionToken) {
      console.log("Checking session token:", sessionToken);
      
      try {
        // Verify session token and get user
        const sql = `SELECT id, grade, authType FROM user 
                     WHERE sessionToken = ? 
                     AND tokenUpdatedAt > DATE_SUB(NOW(), INTERVAL 30 DAY)`;
        const result = await queryAsync(sql, [sessionToken]);
        
        if (result.length > 0) {
          // Attach user to request object
          req.user = result[0];
          userId = result[0].id;
          console.log("Session token authenticated user:", userId);
        }
      } catch (e) {
        console.error("Session token verification error:", e);
      }
    }
  }
  
  // Debug logging for session issues
  if (!userId) {
    console.log("Auth check failed:", {
      sessionId: req.session?.id,
      user: req.user,
      sessionToken: req.headers['x-session-token'],
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
