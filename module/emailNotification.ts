import axios from 'axios';
import { queryAsync } from './commonFunction';

// EmailJS configuration
const EMAILJS_SERVICE_ID = "service_ovjg4lh";
const EMAILJS_TEMPLATE_ID = "template_rr4danj";
const EMAILJS_USER_ID = "3E9EuAAvdJW0hu3kQ";
const EMAILJS_API_URL = "https://api.emailjs.com/api/v1.0/email/send";

// Send email using EmailJS API
export const sendEmailNotification = async (
  email: string, 
  projectName: string,
  contentRequestId: number
) => {
  try {
    const response = await axios.post(EMAILJS_API_URL, {
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_USER_ID,
      template_params: {
        message_type: "이미지 생성 완료 알림",
        message: `안녕하세요!\n\n요청하신 "${projectName}" 프로젝트의 이미지 생성이 완료되었습니다.\n\nAmond 사이트에 접속하여 생성된 콘텐츠를 확인해주세요.\n\n감사합니다.\nAmond 팀`,
        name: "Amond System",
        email: email,
        time: new Date().toLocaleString('ko-KR'),
        to_email: email,
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (response.status === 200) {
      console.log(`이메일 알림 전송 성공: ${email} - 콘텐츠 요청 ID: ${contentRequestId}`);
      return true;
    }
    return false;
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