import express from "express";
const router = express.Router();
import {
  createHashId,
  decodeHashId,
  loadPrompt,
  queryAsync,
} from "../module/commonFunction";
import { deleteS3, getDownloadUrl, uploadPresigned } from "../module/aws";
import { isLogin } from "../module/needAuth";
import {
  gptChatCompletion,
  gptImageCreate,
  gptImageEdit,
} from "../module/aiApi";
import { scrapeImagesController } from "../module/imageScraper";
import { generateBrandChatter, type BrandInput } from "../module/brandAnalysis";
import { checkAndSendNotifications } from "../module/emailNotificationSES";
import moment from "moment-timezone";

// ㅇ 프로젝트 (브랜드 정보)
// 프로젝트 생성 - Allow both authenticated and non-authenticated users
router.post("/project", async function (req, res) {
  let userId = req.user?.id;
  
  // Check for session token if no userId from session
  const sessionToken = req.headers['x-session-token'];
  if (!userId && sessionToken) {
    try {
      const tokenSql = `SELECT id, grade, authType FROM user 
                        WHERE sessionToken = ? 
                        AND tokenUpdatedAt > DATE_SUB(NOW(), INTERVAL 30 DAY)`;
      const tokenResult = await queryAsync(tokenSql, [sessionToken]);
      
      if (tokenResult.length > 0) {
        userId = tokenResult[0].id;
        req.user = tokenResult[0];
        console.log("[Project Creation] Token authenticated user:", userId);
      }
    } catch (e) {
      console.error("Session token verification error:", e);
    }
  }
  
  console.log("Project creation debug:", {
    userId: userId,
    sessionId: req.session?.id,
    sessionToken: sessionToken ? 'Present' : 'Missing',
    isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : false,
    origin: req.headers.origin,
    cookie: req.headers.cookie ? 'Present' : 'Missing',
    userAgent: req.headers['user-agent']?.includes('Safari') ? 'Safari' : 'Other',
  });
  const { name, category, url, reasonList, description, imageNameList } =
    req.body;

  try {
    const presignedUrlList = [];
    const entireDirectoryList = [];
    for (const imageName of imageNameList) {
      const { url, entireDirectory } = await uploadPresigned({
        fileName: imageName,
        directory: "user/project",
      });
      presignedUrlList.push(url);
      entireDirectoryList.push(entireDirectory);
    }

    const sessionName = `${name} - ${moment().format('YYYY-MM-DD HH:mm')}`;
    const sql = `INSERT INTO project(name, sessionName, category, url, imageList, reasonList, description, fk_userId, createdAt, lastAccessedAt)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
    const sqlValues = [
      name,
      sessionName,
      category,
      url,
      entireDirectoryList.join(","),
      reasonList.join(","),
      description,
      userId || null,
    ];
    const result = await queryAsync(sql, sqlValues);

    const projectId = result.insertId;
    const hashId = createHashId(projectId);

    res.status(200).json({
      projectId: hashId,
      presignedUrlList,
      userId: userId || null,
    });
  } catch (e: any) {
    console.error("Project creation error:", e);
    
    // Check if it's an AWS credentials error
    if (e.message && e.message.includes("AWS credentials")) {
      res.status(503).json({ 
        message: "프로젝트 생성 실패: 이미지 업로드 서비스를 일시적으로 사용할 수 없습니다.",
        error: "AWS 서비스 설정 중입니다. 잠시 후 다시 시도해주세요."
      });
    } else {
      res.status(500).json({ 
        message: "프로젝트 생성 실패",
        error: process.env.NODE_ENV === 'development' ? e.message : undefined
      });
    }
  }
});

// 프로젝트 연결
router.put("/project/newUser", async function (req, res) {
  const userId = req.user?.id;
  const { projectId } = req.body;

  try {
    const selectSql = `SELECT id FROM project WHERE fk_userId = ?`;
    const selectResult = await queryAsync(selectSql, [userId]);

    if (selectResult.length !== 0) {
      return res
        .status(200)
        .json({ message: "이미 프로젝트가 연결되어 있습니다." });
    }

    const sql = `UPDATE project SET fk_userId = ? WHERE id = ?`;
    await queryAsync(sql, [userId, decodeHashId(projectId)]);

    res.status(200).json({ message: "프로젝트 연결 성공" });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "프로젝트 연결 실패" });
  }
});

// 모든 프로젝트 세션 가져오기
router.get("/project/sessions", isLogin, async function (req, res) {
  const userId = req.user?.id;

  try {
    const sql = `SELECT id, name, sessionName, category, url, createdAt, lastAccessedAt, isActive 
                 FROM project 
                 WHERE fk_userId = ? 
                 ORDER BY lastAccessedAt DESC, createdAt DESC`;
    const result = await queryAsync(sql, [userId]);
    
    const sessions = result.map((project: any) => ({
      projectId: createHashId(project.id),
      name: project.name,
      sessionName: project.sessionName || `${project.name} - ${moment(project.createdAt).format('YYYY-MM-DD HH:mm')}`,
      category: project.category,
      url: project.url,
      createdAt: project.createdAt,
      lastAccessedAt: project.lastAccessedAt,
      isActive: project.isActive,
    }));

    res.status(200).json({ sessions });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "프로젝트 세션 목록 조회 실패" });
  }
});

// 프로젝트 이동 (legacy - kept for backward compatibility)
router.get("/project", async function (req, res) {
  const userId = req.user?.id;

  try {
    const sql = `SELECT id FROM project WHERE fk_userId = ? ORDER BY lastAccessedAt DESC LIMIT 1`;
    const result = await queryAsync(sql, [userId]);
    let projectId = null;
    if (result.length !== 0) {
      projectId = createHashId(result[0].id);
    }

    res.status(200).json({ projectId });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "프로젝트 이동 실패" });
  }
});

// 프로젝트 세션 이름 변경
router.put("/project/session/rename", isLogin, async function (req, res) {
  const userId = req.user?.id;
  const { projectId, sessionName } = req.body;

  try {
    const sql = `UPDATE project SET sessionName = ? WHERE id = ? AND fk_userId = ?`;
    const result = await queryAsync(sql, [
      sessionName,
      decodeHashId(projectId),
      userId,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "프로젝트를 찾을 수 없습니다." });
    }

    res.status(200).json({ message: "세션 이름이 변경되었습니다." });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "세션 이름 변경 실패" });
  }
});

// 프로젝트 상세 정보
router.get("/project/detail", isLogin, async function (req, res) {
  const userId = req.user?.id;
  const { projectId } = req.query;

  try {
    const sql = `SELECT * FROM project WHERE id = ? && fk_userId = ?`;
    let result = await queryAsync(sql, [
      decodeHashId(projectId as string),
      userId,
    ]);

    if (result.length === 0) {
      return res
        .status(400)
        .json({ message: "일치하는 프로젝트 정보를 찾을 수 없습니다." });
    }
    
    // Update last accessed time
    await queryAsync(
      `UPDATE project SET lastAccessedAt = NOW() WHERE id = ?`,
      [decodeHashId(projectId as string)]
    );

    result[0].imageList = result[0].imageList.split(",");
    result[0].reasonList = result[0].reasonList.split(",");

    const contentRequestSql = `SELECT * FROM contentRequest WHERE fk_projectId = ?`;
    const contentRequestResult = await queryAsync(contentRequestSql, [
      decodeHashId(projectId as string),
    ]);
    let needContentRequest = false;
    if (contentRequestResult.length === 0) {
      needContentRequest = true;
    }

    res.status(200).json({
      projectData: result[0],
      contentRequestResult,
      needContentRequest,
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "프로젝트 이동 실패" });
  }
});

// 프로젝트 이미지 추가 (프로젝트 수정 모달)
router.post("/project/edit/image", isLogin, async function (req, res) {
  const { imageNameList } = req.body;

  try {
    const presignedUrlList = [];
    const entireDirectoryList = [];
    for (const imageName of imageNameList) {
      const { url, entireDirectory } = await uploadPresigned({
        fileName: imageName,
        directory: "user/project",
      });
      presignedUrlList.push(url);
      entireDirectoryList.push(entireDirectory);
    }

    res.status(200).json({ presignedUrlList, entireDirectoryList });
  } catch (e: any) {
    console.error("Project image upload error:", e);
    
    // Check if it's an AWS credentials error
    if (e.message && e.message.includes("AWS credentials")) {
      res.status(503).json({ 
        message: "프로젝트 이미지 추가 실패: 이미지 업로드 서비스를 일시적으로 사용할 수 없습니다.",
        error: "AWS 서비스 설정 중입니다. 잠시 후 다시 시도해주세요."
      });
    } else {
      res.status(500).json({ 
        message: "프로젝트 이미지 추가 실패",
        error: process.env.NODE_ENV === 'development' ? e.message : undefined
      });
    }
  }
});

// 프로젝트 수정 (프로젝트 수정 모달)
router.put("/project", isLogin, async function (req, res) {
  const {
    projectId,
    dbImageList,
    deletedImageList,
    name,
    category,
    url,
    reasonList,
    description,
  } = req.body;

  try {
    const sql = `UPDATE project SET name = ?, category = ?, url = ?, reasonList = ?, description = ?, imageList = ? WHERE id = ?`;
    await queryAsync(sql, [
      name,
      category,
      url,
      reasonList.join(","),
      description,
      dbImageList.join(","),
      projectId,
    ]);

    if (deletedImageList.length !== 0) {
      for (const image of deletedImageList) {
        await deleteS3(image);
      }
    }

    res.status(200).json({ message: "프로젝트 수정 성공" });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "프로젝트 수정 실패" });
  }
});

// ㅇ 콘텐츠 생성 요청
router.post("/request", isLogin, async function (req, res) {
  const { projectData, contentSettings, projectId, requestType } = req.body;
  const userId = req.user?.id;

  // 명시해야 정확한 개수로 생성
  const contentsNum = parseInt(contentSettings.uploadCycle[2]) * 4;
  // Remove video ratio logic - all content will be image content
  const imageNum = contentsNum;
  const videoNum = 0;

  try {
    const limitCheck = await checkLimitUpdate({
      userId: userId || 0,
      requestType,
    });
    if (limitCheck.isOverLimit) {
      return res.status(400).json({ message: limitCheck.message });
    }

    const webSearchPrompt = `사용자의 브랜드/상품명: ${projectData.name}
url: ${projectData.url}
경쟁사: ${contentSettings.competitor}
트렌드 이슈: ${contentSettings.trendIssue}
상세 내용: ${projectData.description?.slice(0, 500) || ""}`;
    const websearchRole = `사용자가 제공하는 url의 값, 경쟁사 관련 내용, 트렌드 이슈를 보고 중요한 핵심들을 뽑아줘! 링크나 출처 등의 정보는 필요 없어. 반드시 지우고, 내용들만 잘 추려줘!`;

    // webSearch의 경우 json 미지원
    const websearchResult = await gptChatCompletion({
      role: websearchRole,
      prompt: webSearchPrompt,
      webSearch: true,
      max_tokens: 1300,
    });
    const searchResult = websearchResult.message;
    const searchToken = websearchResult.totalToken;

    let prompt = await loadPrompt("1차", {
      ...projectData,
      ...contentSettings,
      searchResult,
    });

    prompt =
      prompt +
      `\n\n- 오늘 날짜는 한국 날짜로 ${moment()
        .tz("Asia/Seoul")
        .format("YYYY-MM-DD")} 이야.
다음 주 월요일부터 시작해서 4주간 ${
        contentSettings.uploadCycle
      } 업로드 기준으로 콘텐츠 주제와 날짜를 생성해줘. 즉, 개수는 ${contentsNum}개 인거지.
그리고 날짜는 무조건 이렇게 구성해줘! 주 1회는 수, 주 2회는 월/수, 주 3회는 월/수/금, 주4회는 월/수/금/토!
* 개수와 날짜 구성 꼭 참고해서 해줘!

ㅇ json은 subjectList, dateList로 구성해줘. 둘 다 ${contentsNum}개의 데이터가 들어가야 해. 둘 다 배열로 구성해줘.
- subjectList: 업로드 주기에 맞춰 콘텐츠 주제를 생성해줘. 모든 콘텐츠는 이미지 콘텐츠입니다.
- dateList: 콘텐츠 업로드 날짜를 생성해줘.
`;

    const role = `너는 인스타그램 마케팅 전문가야. 사용자가 입력하는 값을 확인하고 콘텐츠 주제를 생성해줘.
4주간 콘텐츠 주제와 날짜를 생성해주고, 날짜는 평일로만 구성해줘!
- 조건에 맞춰 JSON으로 생성해줘. 입력값은 빈 값이 있을 수도 있는데 그런 경우는 무시하면 된단다.`;

    const subjectResult = await gptChatCompletion({
      role,
      prompt,
      max_tokens: 1800,
      isJson: true,
    });

    const subjectList = subjectResult.message.subjectList;
    const dateList = subjectResult.message.dateList;
    const subjectToken = subjectResult.totalToken;

    // 콘텐츠 요청
    const contentRequestSql = `INSERT INTO contentRequest(trendIssue, snsEvent, essentialKeyword, competitor, uploadCycle, toneMannerList, directionList, searchResult, searchToken, subjectToken, createdAt, fk_projectId)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?);`;
    const contentRequestResult = await queryAsync(contentRequestSql, [
      contentSettings.trendIssue || null,
      contentSettings.snsEvent || null,
      contentSettings.essentialKeyword || null,
      contentSettings.competitor || null,
      contentSettings.uploadCycle,
      JSON.stringify(contentSettings.toneMannerList || []),
      JSON.stringify(contentSettings.directionList || []),
      searchResult?.slice(0, 800) || null,
      searchToken,
      subjectToken,
      decodeHashId(projectId),
    ]);

    const contentRequestId = contentRequestResult.insertId;

    // Get the directionList from contentSettings
    const directionList = contentSettings.contentDirections || contentSettings.directionList || [];

    for (let i = 0; i < subjectList.length; i++) {
      const subject = subjectList[i];
      const date = dateList[i];
      // Assign direction to each content item (cycle through the directionList)
      const direction = directionList[i % directionList.length] || "정보형";

      const contentSql = `INSERT INTO content(postDate, subject, direction, fk_contentRequestId)
      VALUES(?, ?, ?, ?);`;
      await queryAsync(contentSql, [
        date,
        subject?.slice(0, 60) || null,
        direction,
        contentRequestId,
      ]);
    }

    // 콘텐츠 생성
    createContent(contentRequestId);

    res
      .status(200)
      .json({ message: "콘텐츠 생성 요청 성공", contentRequestId });
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "콘텐츠 생성 요청 실패" });
  }
});

// 콘텐츠 생성 (1차에서 생성한 주제를 바탕으로 실제 콘텐츠 생성 - 2차 프롬프트 활용)
async function createContent(contentRequestId: number) {
  try {
    const contentSql = `SELECT id, subject, aiPrompt, imageUrl FROM content WHERE fk_contentRequestId = ?`;
    const contentResult = await queryAsync(contentSql, [contentRequestId]);

    const ogSecondPrompt = await loadPrompt("2차", { contentRequestId });

    // Process content in batches of 4 for maximum speed
    const batchSize = 4;
    for (let i = 0; i < contentResult.length; i += batchSize) {
      const batch = contentResult.slice(i, i + batchSize);

      // Process batch in parallel for maximum speed
      await Promise.all(
        batch.map(
          async (content: {
            id: number;
            subject: string;
            aiPrompt: string | null;
            imageUrl: string | null;
          }) => {
            const { id, subject, aiPrompt, imageUrl } = content;

            // 이미지까지 생성한 경우는, 완료된 것이므로 제외. (혹시 모를 중복 생성 등)
            if (!imageUrl) {
              // aiPrompt가 없는 경우는 aiPrompt까지 생성
              if (!aiPrompt) {
                let currentPrompt = ogSecondPrompt.replace(
                  "{contentSubject}",
                  subject
                );

                // Remove video script logic - all content is image content
                currentPrompt =
                  currentPrompt +
                  `\n- 영상 스크립트(videoScript)는 생성하지 않아도 된단다`;

                const role = `너는 인스타그램 마케팅 전문가야. 사용자가 입력하는 값을 확인하고 콘텐츠를 생성해줘.
필요한 내용은 이미지를 생성하기 위한 프롬프트, 캡션입니다.

ㅇ JSON 형식으로 생성해주는데 aiPrompt, caption로 구성해줘.
- aiPrompt는 내용을 바탕으로 이미지 프롬프트를 작성해줘. 영문으로 작성해줘!
- caption은 내용을 바탕으로 잘 작성해줘. 해시태그까지 포함해서 평문으로 쭉 작성해줘. 한글로 작성해줘!
본문 내용이 길면 문단 구분도 잘 해줘! 그리고 뒷 부분에 해시태그를 나열할 때는 두 번 줄바꿈하고 작성해줘!`;

                const textResult = await gptChatCompletion({
                  role,
                  prompt: currentPrompt,
                  isJson: true,
                  max_tokens: 2000,
                });

                const textToken = textResult.totalToken;
                const contentSql = `UPDATE content SET aiPrompt = ?, caption = ?, textToken = ? WHERE id = ?`;
                await queryAsync(contentSql, [
                  textResult.message?.aiPrompt?.slice(0, 300),
                  textResult.message?.caption?.slice(0, 500),
                  textToken,
                  id,
                ]);
              }

              // 이미지 생성 with smart rate limiting
              try {
                await createImage(id);
              } catch (error) {
                console.error(`Image generation failed for content ${id}:`, error);
                // Continue with next content even if this one fails
              }
            }
          }
        )
      );

      // Shorter delay between batches for faster processing
      if (i + batchSize < contentResult.length) {
        console.log(`✓ Completed batch ${Math.floor(i / batchSize) + 1}, waiting 1.5 seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 1500)); // Reduced to 1.5 seconds
      }
    }
    
    // Check and send email notifications after all images are processed
    await checkAndSendNotifications(contentRequestId);
    
  } catch (e) {
    console.error(e);
    throw e;
  }
}

// 이미지 생성 (2차에서 생성한 aiPrompt를 바탕으로 이미지 생성)
export async function createImage(id: number) {
  try {
    const contentSql = `SELECT a.aiPrompt, b.imageRatio, c.imageList FROM content a
      LEFT JOIN contentRequest b ON a.fk_contentRequestId = b.id
      LEFT JOIN project c ON b.fk_projectId = c.id
      WHERE a.id = ?`;
    const contentResult = await queryAsync(contentSql, [id]);
    const { aiPrompt, imageRatio, imageList } = contentResult[0];

    let imageUrl = "";
    let imageToken = 0;
    
    // Fast retry logic for rate limit errors
    const maxRetries = 1; // Single retry for speed
    let retryCount = 0;
    
    while (retryCount <= maxRetries) {
      try {
        if (imageList === "") {
          const imageResult = await gptImageCreate({
            prompt: aiPrompt,
            saveImageName: `${createHashId(id)}`,
            size:
              imageRatio === "2:3"
                ? "1024x1536"
                : imageRatio === "3:2"
                ? "1536x1024"
                : "1024x1024",
          });
          imageUrl = imageResult.imageUrl;
          imageToken = imageResult.token;
        } else {
          // 이미지 리스트를 배열로 변환
          const imageArray = imageList.split(",");
          // id를 기준으로 순환하는 이미지 선택 (-1로 첫 이미지부터 순환)
          const selectedImageIndex = (id - 1) % imageArray.length;
          const selectedImage = imageArray[selectedImageIndex];

          const imageResult = await gptImageEdit({
            imageUrl: selectedImage,
            prompt: aiPrompt,
            saveImageName: `${createHashId(id)}`,
            size: imageRatio === "1:1" ? "1024x1024" : "1024x1536",
          });
          imageUrl = imageResult.imageUrl;
          imageToken = imageResult.token;
        }

        // 이미지 URL 업데이트
        const updateSql = `UPDATE content SET imageUrl = ?, imageToken = ? WHERE id = ?`;
        await queryAsync(updateSql, [imageUrl, imageToken, id]);
        
        return imageUrl;
      } catch (error: any) {
        // 429 에러 체크 - rate limit exceeded
        if (error.status === 429) {
          retryCount++;
          if (retryCount <= maxRetries) {
            // Fast retry with minimal delay
            console.log(`Rate limit hit for content ${id}, retry ${retryCount}/${maxRetries + 1} - waiting 1s...`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Just 1 second delay
            continue;
          } else {
            // Max retries reached, log and continue
            const updateLogSql = `UPDATE content SET imageLog = 'Rate limit exceeded' WHERE id = ?`;
            await queryAsync(updateLogSql, [id]);
            console.log(`Image generation failed for content ${id} after ${maxRetries + 1} attempts due to rate limit`);
            return null;
          }
        } else {
          // Non-rate-limit error, log and continue
          console.error(`Image generation failed for content ${id}:`, error.message);
          
          // Create a concise error message for database storage
          let errorMsg = 'Connection error';
          if (error.message) {
            if (error.message.includes('Connection error')) {
              errorMsg = 'Connection error';
            } else if (error.message.includes('timeout')) {
              errorMsg = 'Timeout error';
            } else if (error.message.includes('rate limit')) {
              errorMsg = 'Rate limit exceeded';
            } else {
              errorMsg = error.message.slice(0, 50); // Limit to 50 chars for database
            }
          }
          
          const updateLogSql = `UPDATE content SET imageLog = ? WHERE id = ?`;
          await queryAsync(updateLogSql, [errorMsg, id]);
          return null;
        }
      }
    }
  } catch (e) {
    console.error(`Final error for content ${id}:`, e);
    return null;
  }
}

// 요청 조회
router.get("/request", isLogin, async function (req, res) {
  const { projectId } = req.query;

  try {
    const contentRequestSql = `SELECT id FROM contentRequest
      WHERE fk_projectId = ?
      ORDER BY id DESC
      LIMIT 1`;
    const contentRequestResult = await queryAsync(contentRequestSql, [
      decodeHashId(projectId as string),
    ]);

    res
      .status(200)
      .json({ contentRequestId: contentRequestResult?.[0]?.id || null });
  } catch (e) {
    console.error(e);
  }
});

// 생성된 콘텐츠 조회
router.get("/detail", isLogin, async function (req, res) {
  const { contentRequestId } = req.query;

  try {
    const contentRequestSql = `SELECT id, trendIssue, snsEvent, essentialKeyword, competitor, uploadCycle, toneMannerList, directionList, createdAt FROM contentRequest
      WHERE id = ?
      ORDER BY id DESC
      LIMIT 1`;
    const contentRequestResult = await queryAsync(contentRequestSql, [
      contentRequestId,
    ]);

    const contentSql = `SELECT id, postDate, subject, imageUrl, caption, direction FROM content
      WHERE fk_contentRequestId = ?
      ORDER BY id DESC`;
    const contentResult = await queryAsync(contentSql, [contentRequestId]);

    res.status(200).json({
      contentRequestInfo: contentRequestResult[0],
      contentDataList: contentResult,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "콘텐츠 데이터 조회 실패" });
  }
});

// 콘텐츠 이미지 다운로드
router.get("/image", isLogin, async function (req, res) {
  try {
    const { key, fileName } = req.query;
    const url = await getDownloadUrl(key as string, fileName as string);
    res.status(200).json({ url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: `이미지 다운로드 실패\n${e}` });
  }
});

// 생성된 콘텐츠 캡션 직접 수정
router.put("/caption", isLogin, async function (req, res) {
  const { contentId, caption } = req.body;

  try {
    const updateSql = `UPDATE content SET caption = ? WHERE id = ?`;
    await queryAsync(updateSql, [caption, contentId]);

    res.status(200).json({ message: "캡션 수정 성공" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "캡션 수정 실패" });
  }
});

// 콘텐츠 재생성
router.put("/regenerate", isLogin, async function (req, res) {
  const { contentId, requestType, feedback } = req.body;
  const userId = req.user?.id;

  try {
    const limitCheck = await checkLimitUpdate({
      userId: userId || 0,
      requestType,
    });
    if (limitCheck.isOverLimit) {
      return res.status(400).json({ message: limitCheck.message });
    }

    const contentSql = `SELECT a.id, a.subject, a.aiPrompt, a.imageUrl, a.fk_contentRequestId, b.searchResult, b.searchToken, b.subjectToken FROM content a
        LEFT JOIN contentRequest b ON a.fk_contentRequestId = b.id
        WHERE a.id = ?`;
    const contentResult = await queryAsync(contentSql, [contentId]);

    if (requestType === "image") {
      const { imageUrl } = contentResult[0];
      await deleteS3(imageUrl);
      const newImageUrl = await createImage(contentId);
      return res.status(200).json({ imageUrl: newImageUrl || null });
    } else {
      const { subject, fk_contentRequestId } = contentResult[0];

      let secondPrompt = await loadPrompt("2차", {
        contentRequestId: fk_contentRequestId,
      });
      secondPrompt = secondPrompt.replace(
        "{contentSubject}",
        subject?.slice(0, 60)
      );

      // 캡션만 재생성인 경우
      if (requestType === "caption") {
        const role = `너는 인스타그램 마케팅 전문가야. 사용자가 입력하는 값을 확인하고 콘텐츠를 생성해줘.
      ㅇ JSON 형식으로 생성해주는데 caption에 넣어줘.
      - caption은 내용을 바탕으로 잘 작성해줘. 해시태그까지 포함해서 평문으로 쭉 작성해줘. 한글로 작성해줘!`;

        const textResult = await gptChatCompletion({
          role,
          prompt: secondPrompt,
          isJson: true,
          max_tokens: 1200,
        });

        const textToken = textResult.totalToken;
        const caption = textResult.message?.caption?.slice(0, 500);
        const contentSql = `UPDATE content SET caption = ?, textToken = ? WHERE id = ?`;
        await queryAsync(contentSql, [caption, textToken, contentId]);
        return res.status(200).json({ caption });
      } else if (requestType === "all") {
        // 피드백을 통한 전체 재생성인 경우
        // Remove video script logic - all content is image content
        secondPrompt =
          secondPrompt +
          `\n\n- 영상 스크립트(videoScript)는 생성하지 않아도 되니까 null로 넣어줘.`;

        secondPrompt =
          secondPrompt + `\n\n- 피드백을 참고해서 콘텐츠를 재생성해줘!\n-`;

        const role = `너는 인스타그램 마케팅 전문가야. 사용자가 입력하는 값을 확인하고 콘텐츠를 생성해줘.
필요한 내용은 이미지를 생성하기 위한 프롬프트, 캡션입니다.

ㅇ JSON 형식으로 생성해주는데 aiPrompt, caption로 구성해줘.
- aiPrompt는 내용을 바탕으로 이미지 프롬프트를 작성해줘. 영문으로 작성해줘!
- caption은 내용을 바탕으로 잘 작성해줘. 해시태그까지 포함해서 평문으로 쭉 작성해줘. 한글로 작성해줘!`;
        const textResult = await gptChatCompletion({
          role,
          prompt: secondPrompt,
          isJson: true,
          max_tokens: 2000,
        });

        const textToken = textResult.totalToken;
        const caption = textResult.message?.caption?.slice(0, 500);
        const contentSql = `UPDATE content SET aiPrompt = ?, caption = ?, textToken = ? WHERE id = ?`;
        await queryAsync(contentSql, [
          textResult.message?.aiPrompt?.slice(0, 300),
          caption,
          textToken,
          contentId,
        ]);

        const { imageUrl } = contentResult[0];
        await deleteS3(imageUrl);
        const newImageUrl = await createImage(contentId);
        return res.status(200).json({ imageUrl: newImageUrl || null, caption });
      }
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "재생성 실패" });
  }
});

// 요청 목록 조회
router.get("/request/list", isLogin, async function (req, res) {
  const { projectId } = req.query;

  try {
    const contentRequestSql = `SELECT id, essentialKeyword, uploadCycle, createdAt FROM contentRequest
      WHERE fk_projectId = ?`;
    const contentRequestResult = await queryAsync(contentRequestSql, [
      decodeHashId(projectId as string),
    ]);

    res.status(200).json({ contentRequestList: contentRequestResult });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "콘텐츠 생성 목록 조회 실패" });
  }
});

async function checkLimitUpdate({
  userId,
  requestType,
}: {
  userId: number;
  requestType: string;
}) {
  let answer = {
    isOverLimit: false,
    message: "",
  };

  // 최초 생성인 경우, 생성 횟수 탐색
  if (requestType === "create") {
    const limitCheckSql = `SELECT COUNT(*) as createNum FROM contentRequest a
        LEFT JOIN project b ON a.fk_projectId = b.id
        LEFT JOIN user c ON b.fk_userId = c.id
        WHERE c.id = ? && date(a.createdAt) = ?`;
    const limitCheckResult = await queryAsync(limitCheckSql, [
      userId,
      moment().tz("Asia/Seoul").format("YYYY-MM-DD"),
    ]);

    if (limitCheckResult[0]?.createNum >= 3) {
      return {
        isOverLimit: true,
        message: "하루에 최대 3개까지 생성하실 수 있어요!",
      };
    }
  } else {
    // 재생성인 경우, 로그 탐색
    const limitCheckSql = `SELECT caption, image, \`all\` FROM regenerateLog
      WHERE fk_userId = ? && date(createdAt) = ?`;
    const limitCheckResult = await queryAsync(limitCheckSql, [
      userId,
      moment().tz("Asia/Seoul").format("YYYY-MM-DD"),
    ]);

    // 없는 경우, 로그 생성
    if (limitCheckResult.length === 0) {
      const insertSql = `INSERT INTO regenerateLog(fk_userId, \`${requestType}\`, createdAt) VALUES(?, ?, NOW())`;
      await queryAsync(insertSql, [userId, 1]);

      return {
        isOverLimit: false,
        message: "",
      };
    } else {
      // 있는 경우들, 초과 여부 체크 후 로그 업데이트
      if (limitCheckResult[0].caption >= 2 && requestType === "caption") {
        answer = {
          isOverLimit: true,
          message: "하루에 최대 2개까지 캡션 재생성하실 수 있어요!",
        };
      } else if (limitCheckResult[0].image >= 2 && requestType === "image") {
        answer = {
          isOverLimit: true,
          message: "하루에 최대 2개까지 이미지 재생성하실 수 있어요!",
        };
      } else if (limitCheckResult[0].all >= 2 && requestType === "all") {
        answer = {
          isOverLimit: true,
          message: "하루에 최대 2개까지 콘텐츠를 재생성하실 수 있어요!",
        };
      }

      if (!answer.isOverLimit) {
        const updateSql = `UPDATE regenerateLog SET \`${requestType}\` = \`${requestType}\` + 1
        WHERE fk_userId = ? && date(createdAt) = ?`;
        await queryAsync(updateSql, [
          userId,
          moment().tz("Asia/Seoul").format("YYYY-MM-DD"),
        ]);
      }
    }
  }

  return answer;
}

// Image scraping endpoint
router.post("/scrape-images", scrapeImagesController);

// Email notification endpoint
router.post("/notification/email", isLogin, async function (req, res) {
  const { email, contentRequestId } = req.body;
  const userId = req.user?.id;

  if (!email || !contentRequestId) {
    return res.status(400).json({ message: "이메일과 콘텐츠 요청 ID가 필요합니다." });
  }

  try {
    // Store email notification request in database
    const sql = `INSERT INTO emailNotification (fk_userId, fk_contentRequestId, email, status, createdAt)
      VALUES (?, ?, ?, 'pending', NOW())`;
    await queryAsync(sql, [userId, contentRequestId, email]);

    return res.status(200).json({ message: "이메일 알림이 설정되었습니다." });
  } catch (e) {
    console.error("Email notification error:", e);
    return res.status(500).json({ message: "이메일 알림 설정 실패" });
  }
});


// Brand summary generation endpoint
router.post("/brand-summary", async function (req, res) {
  // Set timeout for this endpoint
  req.setTimeout(60000); // 60 seconds timeout
  
  // Ensure CORS headers are set early
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  const userId = req.user?.id;
  const brandInput: BrandInput = req.body;

  console.log('🚀 DEBUG: Brand summary request received');
  console.log('🚀 DEBUG: User ID:', userId);
  console.log('🚀 DEBUG: Brand input received:', {
    brandName: brandInput.brandName,
    category: brandInput.category,
    reasons: brandInput.reasons,
    description: brandInput.description?.substring(0, 100) + '...',
    hasUrl: brandInput.hasUrl,
    url: brandInput.url,
    imageCount: brandInput.imageCount,
    selectedImagesCount: brandInput.selectedImages?.length || 0
  });

  if (brandInput.selectedImages && brandInput.selectedImages.length > 0) {
    console.log('📸 DEBUG: Selected images details:');
    brandInput.selectedImages.forEach((image, index) => {
      console.log(`📸 DEBUG: Image ${index + 1}:`, {
        fileName: image.fileName,
        type: image.type,
        index: image.index,
        hasBase64: !!image.base64,
        hasUrl: !!image.url,
        base64Length: image.base64?.length || 0,
        url: image.url || 'N/A'
      });
    });
  } else {
    console.log('⚠️ DEBUG: No selected images provided');
  }

  try {
    // Validate required fields
    if (!brandInput.brandName || !brandInput.category || !brandInput.reasons || !brandInput.description) {
      console.log('❌ DEBUG: Missing required fields');
      return res.status(400).json({ 
        error: '필수 필드가 누락되었습니다. 브랜드명, 카테고리, 운영이유, 설명을 모두 입력해주세요.' 
      });
    }

    // Get user information for the analysis
    // Since user table doesn't have a 'name' column, we'll use a fallback
    const userName = `사용자-${userId}`;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!openaiApiKey) {
      console.log('❌ DEBUG: OpenAI API key not found');
      return res.status(500).json({ error: 'OpenAI API 키가 설정되지 않았습니다.' });
    }

    console.log('✅ DEBUG: Starting brand analysis with OpenAI');
    
    // Generate brand summary
    const brandSummary = await generateBrandChatter(brandInput, userName, openaiApiKey);

    console.log('✅ DEBUG: Brand analysis completed successfully');

    // Check response size before sending
    const responseData = { 
      summary: brandSummary.formattedText,
      data: brandSummary 
    };
    
    const responseSize = JSON.stringify(responseData).length;
    console.log(`📏 DEBUG: Response size: ${responseSize} bytes (${(responseSize / 1024 / 1024).toFixed(2)} MB)`);
    
    if (responseSize > 10 * 1024 * 1024) { // 10MB limit
      console.warn('⚠️ WARNING: Response size exceeds 10MB, sending without image data');
      // Remove base64 images from response if too large
      const reducedData = {
        ...responseData,
        data: {
          ...responseData.data,
          imageAnalysis: 'Response too large - images omitted'
        }
      };
      return res.status(200).json(reducedData);
    }
    
    // Return the summary in the expected format
    res.status(200).json(responseData);

  } catch (error) {
    console.error('❌ ERROR: Brand summary generation failed:', error);
    console.error('❌ ERROR: Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      name: error instanceof Error ? error.name : 'Unknown error type'
    });
    res.status(500).json({ 
      error: '브랜드 분석 중 오류가 발생했습니다.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
