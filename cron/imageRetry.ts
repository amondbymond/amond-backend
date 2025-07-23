import cron from "node-cron";
import { queryAsync } from "../module/commonFunction";
import { createImage } from "../router/content";

let isProcessing = false;

// 1분마다 실행
cron.schedule("* * * * *", async () => {
  // 이미 처리 중이면 새로운 작업 시작하지 않음
  if (isProcessing) {
    return;
  }

  try {
    isProcessing = true;

    // Rate limit이 발생한 이미지들 조회
    const selectSql = `SELECT id FROM content WHERE imageLog = 'Rate limit exceeded'`;
    const failedImages = await queryAsync(selectSql);

    for (const image of failedImages) {
      try {
        // 생성 시도 중임을 표시
        const updateLogSql = `UPDATE content SET imageLog = '생성시도...' WHERE id = ?`;
        await queryAsync(updateLogSql, [image.id]);

        // 이미지 재생성 시도
        await createImage(image.id);

        // 성공 시 로그 삭제
        const clearLogSql = `UPDATE content SET imageLog = NULL WHERE id = ?`;
        await queryAsync(clearLogSql, [image.id]);
        
        // Check if this was the last image for a content request
        const checkCompleteSql = `SELECT a.fk_contentRequestId, COUNT(*) as totalImages, 
          SUM(CASE WHEN a.imageUrl IS NOT NULL THEN 1 ELSE 0 END) as completedImages
          FROM content a
          WHERE a.fk_contentRequestId = (SELECT fk_contentRequestId FROM content WHERE id = ?)
          GROUP BY a.fk_contentRequestId`;
        const completionResult = await queryAsync(checkCompleteSql, [image.id]);
        
        if (completionResult.length > 0) {
          const { fk_contentRequestId, totalImages, completedImages } = completionResult[0];
          
          // If all images are completed, send email notifications
          if (totalImages === completedImages) {
            const notificationSql = `SELECT * FROM emailNotification 
              WHERE fk_contentRequestId = ? AND status = 'pending'`;
            const notifications = await queryAsync(notificationSql, [fk_contentRequestId]);
            
            for (const notification of notifications) {
              // TODO: Send actual email here
              console.log(`이메일 알림 전송: ${notification.email} - 콘텐츠 생성 완료`);
              
              // Update notification status
              const updateNotificationSql = `UPDATE emailNotification SET status = 'sent' WHERE id = ?`;
              await queryAsync(updateNotificationSql, [notification.id]);
            }
          }
        }
      } catch (e) {
        console.error(`이미지 재생성 실패 (ID: ${image.id}):`, e);
        // 429 에러가 아닌 다른 에러의 경우에도 로그를 남김
        if ((e as any).status !== 429) {
          const updateLogSql = `UPDATE content SET imageLog = '기타 에러' WHERE id = ?`;
          await queryAsync(updateLogSql, [image.id]);
        }
      }
    }
  } catch (e) {
    console.error("이미지 재생성 cronJob 에러:", e);
  } finally {
    isProcessing = false;
    // console.log("이미지 재생성 작업 완료");
  }
});
