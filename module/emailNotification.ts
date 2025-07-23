import nodemailer from 'nodemailer';
import { queryAsync } from './commonFunction';
import dotenv from 'dotenv';
dotenv.config();

// Create reusable transporter object using SMTP transport
// You'll need to add these to your .env file:
// EMAIL_HOST=smtp.gmail.com (or your SMTP server)
// EMAIL_PORT=587
// EMAIL_USER=your-email@gmail.com
// EMAIL_PASS=your-app-password
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Send email using nodemailer
export const sendEmailNotification = async (
  email: string, 
  projectName: string,
  contentRequestId: number
) => {
  try {
    // If email credentials are not configured, skip sending
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log('이메일 설정이 없어 이메일 전송을 건너뜁니다.');
      return false;
    }

    const mailOptions = {
      from: `"Amond System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `[Amond] ${projectName} 이미지 생성 완료`,
      html: `
        <div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #5865F2; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">Amond</h1>
          </div>
          <div style="padding: 30px; background-color: #f5f5f5;">
            <h2 style="color: #333;">이미지 생성 완료 알림</h2>
            <p style="color: #666; line-height: 1.6;">
              안녕하세요!<br><br>
              요청하신 <strong>"${projectName}"</strong> 프로젝트의 이미지 생성이 완료되었습니다.<br><br>
              Amond 사이트에 접속하여 생성된 콘텐츠를 확인해주세요.<br><br>
              감사합니다.<br>
              Amond 팀
            </p>
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL || 'https://amond.kr'}" 
                 style="background-color: #5865F2; color: white; padding: 12px 30px; 
                        text-decoration: none; border-radius: 5px; display: inline-block;">
                콘텐츠 확인하기
              </a>
            </div>
          </div>
          <div style="padding: 20px; text-align: center; color: #999; font-size: 12px;">
            © 2025 Amond. All rights reserved.
          </div>
        </div>
      `,
      text: `안녕하세요!\n\n요청하신 "${projectName}" 프로젝트의 이미지 생성이 완료되었습니다.\n\nAmond 사이트에 접속하여 생성된 콘텐츠를 확인해주세요.\n\n감사합니다.\nAmond 팀`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`이메일 알림 전송 성공: ${email} - 콘텐츠 요청 ID: ${contentRequestId}`, info.messageId);
    return true;
  } catch (error) {
    console.error('이메일 전송 실패:', error);
    return false;
  }
};

// Check if all images are completed and send notifications
export const checkAndSendNotifications = async (contentRequestId: number) => {
  try {
    // Check if all images are completed
    const checkCompleteSql = `
      SELECT COUNT(*) as totalImages, 
        SUM(CASE WHEN imageUrl IS NOT NULL THEN 1 ELSE 0 END) as completedImages
      FROM content 
      WHERE fk_contentRequestId = ?`;
    const completionResult = await queryAsync(checkCompleteSql, [contentRequestId]);
    
    if (completionResult.length === 0) return;
    
    const { totalImages, completedImages } = completionResult[0];
    
    // If all images are completed, send email notifications
    if (totalImages === completedImages && totalImages > 0) {
      // Get pending notifications
      const notificationSql = `
        SELECT en.*, p.name as projectName 
        FROM emailNotification en
        JOIN contentRequest cr ON en.fk_contentRequestId = cr.id
        JOIN project p ON cr.fk_projectId = p.id
        WHERE en.fk_contentRequestId = ? AND en.status = 'pending'`;
      const notifications = await queryAsync(notificationSql, [contentRequestId]);
      
      for (const notification of notifications) {
        const emailSent = await sendEmailNotification(
          notification.email,
          notification.projectName,
          contentRequestId
        );
        
        if (emailSent) {
          // Update notification status
          const updateSql = `
            UPDATE emailNotification 
            SET status = 'sent', sentAt = NOW() 
            WHERE id = ?`;
          await queryAsync(updateSql, [notification.id]);
        } else {
          // Mark as failed
          const updateSql = `
            UPDATE emailNotification 
            SET status = 'failed' 
            WHERE id = ?`;
          await queryAsync(updateSql, [notification.id]);
        }
      }
    }
  } catch (error) {
    console.error('알림 확인 및 전송 중 오류:', error);
  }
};