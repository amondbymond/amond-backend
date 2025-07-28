import { Resend } from 'resend';
import { queryAsync } from './commonFunction';
import dotenv from 'dotenv';
dotenv.config();

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Send email using Resend
export const sendEmailNotification = async (
  email: string, 
  projectName: string,
  contentRequestId: number
) => {
  try {
    // If Resend API key is not configured, skip sending
    if (!process.env.RESEND_API_KEY) {
      console.log('Resend API 키가 설정되지 않아 이메일 전송을 건너뜁니다.');
      return false;
    }

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Amond <noreply@mond.io.kr>',
      to: [email],
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
    });

    if (error) {
      throw error;
    }

    console.log(`이메일 알림 전송 성공: ${email} - 콘텐츠 요청 ID: ${contentRequestId}`, data?.id);
    return true;
  } catch (error) {
    console.error('Resend 이메일 전송 실패:', error);
    return false;
  }
};

// Keep the same checkAndSendNotifications function
export { checkAndSendNotifications } from './emailNotification';