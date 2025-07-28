import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { queryAsync } from './commonFunction';
import dotenv from 'dotenv';
dotenv.config();

// Initialize AWS SES
const sesClient = new SESClient({
  region: process.env.AWS_REGION || "ap-northeast-2", // Seoul region
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// Send email using AWS SES
export const sendEmailNotification = async (
  email: string, 
  projectName: string,
  contentRequestId: number
) => {
  try {
    // If AWS credentials are not configured, skip sending
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.log('AWS SES 설정이 없어 이메일 전송을 건너뜁니다.');
      return false;
    }

    const params = {
      Source: process.env.SES_FROM_EMAIL || "noreply@mond.io.kr", // Must be verified in SES
      Destination: {
        ToAddresses: [email],
      },
      Message: {
        Subject: {
          Data: `[Amond] ${projectName} 이미지 생성 완료`,
          Charset: "UTF-8",
        },
        Body: {
          Text: {
            Data: `안녕하세요!\n\n요청하신 "${projectName}" 프로젝트의 이미지 생성이 완료되었습니다.\n\nAmond 사이트에 접속하여 생성된 콘텐츠를 확인해주세요.\n\n감사합니다.\nAmond 팀`,
            Charset: "UTF-8",
          },
          Html: {
            Data: `
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
            Charset: "UTF-8",
          },
        },
      },
    };

    const command = new SendEmailCommand(params);
    await sesClient.send(command);
    
    console.log(`이메일 알림 전송 성공: ${email} - 콘텐츠 요청 ID: ${contentRequestId}`);
    return true;
  } catch (error) {
    console.error('AWS SES 이메일 전송 실패:', error);
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