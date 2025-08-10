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
import { generateBrandChatter } from "../module/brandAnalysis";
import { checkAndSendNotifications } from "../module/emailNotificationSES";
import { canUserPerformAction, trackUsage, getUserUsageLimits } from "../module/usageTracking";
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
  
  // Commented out project creation debug logs
  // console.log("Project creation debug:", {
  //   userId: userId,
  //   sessionId: req.session?.id,
  //   sessionToken: sessionToken ? 'Present' : 'Missing',
  //   isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : false,
  //   origin: req.headers.origin,
  //   cookie: req.headers.cookie ? 'Present' : 'Missing',
  //   userAgent: req.headers['user-agent']?.includes('Safari') ? 'Safari' : 'Other',
  // });
  const { 
    name, category, url, reasonList, description, imageNameList,
    advantages, coreProduct, coreProductDetail, targetAudience, targetAudienceDetail,
    mainColor, selectedContentTypes, brandAnalysis
  } = req.body;

  try {
    // Check if user can create a project
    if (userId) {
      const canCreate = await canUserPerformAction(userId, 'create_project');
      if (!canCreate.allowed) {
        return res.status(403).json({
          message: canCreate.reason || '프로젝트 생성 한도에 도달했습니다.',
          remaining: canCreate.remaining || 0
        });
      }
    }
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

    // First, check if a brand with this name exists for the user
    let brandId = null;
    if (userId) {
      const existingBrand = await queryAsync(
        `SELECT id FROM brand WHERE name = ? AND fk_userId = ?`,
        [name, userId]
      );
      
      if (existingBrand.length === 0) {
        // Create a new brand with additional fields
        const brandResult = await queryAsync(
          `INSERT INTO brand(
            name, category, url, description, fk_userId,
            advantages, coreProduct, coreProductDetail, 
            targetAudience, targetAudienceDetail,
            mainColor, selectedContentTypes, brandAnalysis
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            name, category, url, description, userId,
            advantages || null,
            coreProduct || null,
            coreProductDetail || null,
            targetAudience || null,
            targetAudienceDetail || null,
            mainColor || null,
            selectedContentTypes ? JSON.stringify(selectedContentTypes) : null,
            brandAnalysis || null
          ]
        );
        brandId = brandResult.insertId;
        console.log(`[CREATE PROJECT] Created new brand: ${name} with ID: ${brandId}`);
      } else {
        brandId = existingBrand[0].id;
        console.log(`[CREATE PROJECT] Using existing brand: ${name} with ID: ${brandId}`);
      }
    }

    const sessionName = `${name} - ${moment().format('YYYY-MM-DD HH:mm')}`;
    const sql = `INSERT INTO project(name, sessionName, category, url, imageList, reasonList, description, fk_userId, fk_brandId, createdAt, lastAccessedAt)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
    const sqlValues = [
      name,
      sessionName,
      category,
      url,
      entireDirectoryList.join(","),
      reasonList.join(","),
      description,
      userId || null,
      brandId,
    ];
    const result = await queryAsync(sql, sqlValues);

    const projectId = result.insertId;
    const hashId = createHashId(projectId);

    // Track the project creation
    if (userId) {
      await trackUsage(userId, 'project_creation', projectId, undefined, brandId);
    }

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
    // Get all content requests with their project info
    // Don't do any cleanup here - just return valid projects
    const sql = `SELECT 
                   cr.id as contentRequestId,
                   cr.createdAt as contentRequestCreatedAt,
                   p.id, p.name, p.sessionName, p.category, p.url, p.createdAt, p.lastAccessedAt, p.isActive 
                 FROM contentRequest cr
                 JOIN project p ON cr.fk_projectId = p.id
                 WHERE p.fk_userId = ? 
                 AND p.name != 'ff'
                 AND p.name != ''
                 AND p.name IS NOT NULL
                 AND p.fk_brandId IS NOT NULL
                 ORDER BY cr.createdAt DESC`;
    const result = await queryAsync(sql, [userId]);
    
    const sessions = result.map((row: any) => ({
      projectId: createHashId(row.id) + '_cr' + row.contentRequestId, // Unique ID for each content request
      name: row.name,
      sessionName: row.sessionName || `${row.name} - ${moment(row.contentRequestCreatedAt).format('YYYY-MM-DD HH:mm')}`,
      category: row.category,
      url: row.url,
      createdAt: row.contentRequestCreatedAt, // Use content request creation date
      lastAccessedAt: row.lastAccessedAt,
      isActive: row.isActive,
      contentRequestId: row.contentRequestId, // Keep track of the actual content request
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
  let { projectId } = req.query as { projectId: string };

  try {
    // Extract base project ID if it contains content request suffix
    if (projectId.includes('_cr')) {
      projectId = projectId.split('_cr')[0];
    }

    const sql = `SELECT * FROM project WHERE id = ? && fk_userId = ?`;
    let result = await queryAsync(sql, [
      decodeHashId(projectId),
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
      [decodeHashId(projectId)]
    );

    result[0].imageList = result[0].imageList.split(",");
    result[0].reasonList = result[0].reasonList.split(",");

    const contentRequestSql = `SELECT * FROM contentRequest WHERE fk_projectId = ?`;
    const contentRequestResult = await queryAsync(contentRequestSql, [
      decodeHashId(projectId),
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
    // Get current project info to update sessionName
    const currentProject = await queryAsync(
      "SELECT sessionName, createdAt FROM project WHERE id = ?",
      [projectId]
    );
    
    // Extract date from sessionName or use createdAt
    let dateStr = "";
    if (currentProject.length > 0) {
      const sessionName = currentProject[0].sessionName;
      if (sessionName && sessionName.includes(" - ")) {
        dateStr = sessionName.split(" - ")[1];
      } else {
        dateStr = moment(currentProject[0].createdAt).format('YYYY-MM-DD HH:mm');
      }
    }
    
    // Update project with new sessionName
    const newSessionName = `${name} - ${dateStr}`;
    const sql = `UPDATE project SET name = ?, category = ?, url = ?, reasonList = ?, description = ?, imageList = ?, sessionName = ? WHERE id = ?`;
    await queryAsync(sql, [
      name,
      category,
      url,
      reasonList.join(","),
      description,
      dbImageList.join(","),
      newSessionName,
      projectId,
    ]);

    // Also update the brand if this project has one
    const projectResult = await queryAsync(
      "SELECT fk_brandId FROM project WHERE id = ?",
      [projectId]
    );
    
    if (projectResult.length > 0 && projectResult[0].fk_brandId) {
      const brandId = projectResult[0].fk_brandId;
      const brandSql = `UPDATE brand SET name = ?, category = ?, url = ?, description = ?, updatedAt = NOW() WHERE id = ?`;
      await queryAsync(brandSql, [name, category, url, description, brandId]);
      console.log(`[CONTENT] Updated brand ${brandId} along with project ${projectId}`);
    }

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
  let { projectData, contentSettings, projectId, requestType } = req.body;
  const userId = req.user?.id;
  const imageConfigs = contentSettings.imageConfigs || [];

  // Extract base project ID if it contains content request suffix
  if (projectId && projectId.includes('_cr')) {
    projectId = projectId.split('_cr')[0];
  }

  // Fixed number of images per content request (feed set)
  const IMAGES_PER_FEEDSET = 4; // Change this to 9 when needed
  const contentsNum = IMAGES_PER_FEEDSET;
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

    // Fetch brand data including selectedContentTypes and mainColor
    const brandDataSql = `
      SELECT b.selectedContentTypes, b.mainColor, b.advantages, b.coreProduct, b.targetAudience
      FROM project p
      LEFT JOIN brand b ON p.fk_brandId = b.id
      WHERE p.id = ?
    `;
    const brandDataResult = await queryAsync(brandDataSql, [decodeHashId(projectId)]);
    const brandData = brandDataResult[0] || {};
    
    // Parse selectedContentTypes from JSON
    let selectedContentTypes = [];
    try {
      selectedContentTypes = brandData.selectedContentTypes ? JSON.parse(brandData.selectedContentTypes) : [];
    } catch (e) {
      console.log('[CONTENT] Failed to parse selectedContentTypes:', e);
      selectedContentTypes = [];
    }
    
    // Check if we should use content types at all
    const noContentTypes = contentSettings.noContentTypes || false;
    
    // If imageConfigs provided, extract content types from them
    if (imageConfigs.length > 0) {
      selectedContentTypes = imageConfigs.map((config: any) => config.contentType || '방향성 없음');
    } else if (!noContentTypes && selectedContentTypes.length === 0) {
      // If no content types selected and not explicitly disabled, use default based on category
      const CONTENT_TYPES: { [key: string]: string[] } = {
        '뷰티/미용': ['효능 강조', '사용 후기', '신제품 소개', '이벤트'],
        '미식/푸드': ['메뉴 소개', '후기 리그램', '시즌 메뉴', '할인 이벤트'],
        '일상/트렌드': ['일상 공유', '감성 무드', '트렌드 밈', '팔로워 소통'],
        '패션': ['착장 소개', '신상 오픈', '스타일링팁', '할인 공지'],
        '자기개발': ['인사이트', '동기부여', '후기 인증', '강의 소개'],
        '지식 콘텐츠': ['트렌드 요약', '뉴스 큐레이션', '카드뉴스', '인포그래픽'],
        '건강/헬스': ['운동 루틴', '후기 사례', '클래스 안내', '식단 공유'],
        '기타': ['서비스/상품 소개', '창업 스토리', '기능 강조', '팔로우 이벤트']
      };
      selectedContentTypes = (CONTENT_TYPES[projectData.category as string] || CONTENT_TYPES['기타']).slice(0, 4);
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
    
    // Add content types information to the prompt
    const hasValidContentTypes = selectedContentTypes.length > 0 && selectedContentTypes.some((ct: string) => ct && ct !== '방향성 없음');
    if (hasValidContentTypes) {
      prompt = prompt + `\n\n[콘텐츠 타입 가이드]\n이 브랜드는 다음 4가지 콘텐츠 타입으로 이미지를 제작합니다:\n- ${selectedContentTypes.join('\n- ')}\n\n각 콘텐츠는 위 타입 중 하나에 망춰 제작되어야 합니다.`;
    }
    
    // Add main color hint if available
    if (brandData.mainColor) {
      prompt = prompt + `\n\n[브랜드 컬러]\n메인 컬러: ${brandData.mainColor} (이 색상을 테마로 활용하되, 모든 이미지가 같은 색일 필요는 없습니다)`;
    }

    // Add additional instructions if provided (for new feed set creation)
    if (contentSettings.additionalInstructions) {
      prompt = prompt + `\n\n[추가 요청사항]\n${contentSettings.additionalInstructions}\n`;
    }

    prompt =
      prompt +
      `\n\n- 오늘 날짜는 한국 날짜로 ${moment()
        .tz("Asia/Seoul")
        .format("YYYY-MM-DD")} 이야.
다음 주 월요일부터 시작해서 4주간 ${
        contentSettings.uploadCycle
      } 업로드 기준으로 콘텐츠를 생성해줘. 
총 ${contentsNum}개의 콘텐츠를 생성하되, 업로드 주기에 맞춰 적절히 분배해줘.
예: 주 1회면 4주에 걸쳐 매주 1개씩, 주 2회면 2주에 걸쳐 주당 2개씩 등으로 배분해줘.

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

    // 콘텐츠 요청 - store selectedContentTypes instead of directionList
    const contentRequestSql = `INSERT INTO contentRequest(trendIssue, snsEvent, essentialKeyword, competitor, uploadCycle, toneMannerList, directionList, searchResult, searchToken, subjectToken, mainColor, createdAt, fk_projectId)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?);`;
    const contentRequestResult = await queryAsync(contentRequestSql, [
      contentSettings.trendIssue || null,
      contentSettings.snsEvent || null,
      contentSettings.essentialKeyword || null,
      contentSettings.competitor || null,
      contentSettings.uploadCycle,
      JSON.stringify(contentSettings.toneMannerList || []),
      JSON.stringify(selectedContentTypes), // Store content types as directionList
      searchResult?.slice(0, 800) || null,
      searchToken,
      subjectToken,
      brandData.mainColor || null,
      decodeHashId(projectId),
    ]);

    const contentRequestId = contentRequestResult.insertId;

    // Use selectedContentTypes for content creation
    for (let i = 0; i < subjectList.length; i++) {
      const subject = subjectList[i];
      const date = dateList[i];
      let contentType = null;
      let snsEvent = false;
      let imageSize = '1:1';
      let additionalText = '';
      
      // Extract from imageConfigs if available
      if (imageConfigs.length > 0 && imageConfigs[i]) {
        const config = imageConfigs[i];
        contentType = config.contentType === '방향성 없음' ? null : config.contentType;
        snsEvent = config.snsEvent || false;
        imageSize = config.imageSize || '1:1';
        additionalText = config.additionalText || '';
      } else if (selectedContentTypes.length > 0) {
        // Fallback to cycling through content types
        contentType = selectedContentTypes[i % selectedContentTypes.length] || selectedContentTypes[0] || "서비스/상품 소개";
      }

      const contentSql = `INSERT INTO content(postDate, subject, direction, snsEvent, imageSize, additionalText, fk_contentRequestId)
      VALUES(?, ?, ?, ?, ?, ?, ?);`;
      await queryAsync(contentSql, [
        date,
        subject?.slice(0, 60) || null,
        contentType, // Store content type in direction field (null if no content types)
        snsEvent,
        imageSize,
        additionalText,
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
    const contentSql = `SELECT id, subject, direction, snsEvent, imageSize, additionalText, aiPrompt, imageUrl FROM content WHERE fk_contentRequestId = ?`;
    const contentResult = await queryAsync(contentSql, [contentRequestId]);
    
    // Get mainColor from contentRequest
    const contentRequestSql = `SELECT mainColor FROM contentRequest WHERE id = ?`;
    const contentRequestResult = await queryAsync(contentRequestSql, [contentRequestId]);
    const mainColor = contentRequestResult[0]?.mainColor || null;

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
            direction: string;
            snsEvent: boolean;
            imageSize: string;
            additionalText: string;
            aiPrompt: string | null;
            imageUrl: string | null;
          }) => {
            const { id, subject, direction, snsEvent, imageSize, additionalText, aiPrompt, imageUrl } = content;

            // 이미지까지 생성한 경우는, 완료된 것이므로 제외. (혹시 모를 중복 생성 등)
            if (!imageUrl) {
              // aiPrompt가 없는 경우는 aiPrompt까지 생성
              if (!aiPrompt) {
                let currentPrompt = ogSecondPrompt.replace(
                  "{contentSubject}",
                  subject
                );
                
                // Add content type information if available
                if (direction) {
                  currentPrompt = currentPrompt + `\n\n[콘텐츠 타입]\n이 콘텐츠는 "${direction}" 타입으로 제작되어야 합니다.`;
                }
                
                // Add SNS event information
                if (snsEvent) {
                  currentPrompt = currentPrompt + `\n\n[SNS 이벤트]\n이 콘텐츠는 SNS 이벤트를 강조하는 형태로 제작해주세요. 팔로우, 좋아요, 공유 등을 유도하는 이벤트 요소를 포함해주세요.`;
                }
                
                // Add individual additional text if available
                if (additionalText) {
                  currentPrompt = currentPrompt + `\n\n[개별 요청사항]\n${additionalText}`;
                }
                
                // Add main color hint if available
                if (mainColor) {
                  currentPrompt = currentPrompt + `\n\n[브랜드 컬러]\n메인 컬러: ${mainColor} (이 색상을 테마로 활용하되, 자연스럽게 적용해주세요)`;
                }

                // Remove video script logic - all content is image content
                currentPrompt =
                  currentPrompt +
                  `\n- 영상 스크립트(videoScript)는 생성하지 않아도 된단다`;

                const role = `너는 인스타그램 마케팅 전문가야. 사용자가 입력하는 값을 확인하고 콘텐츠를 생성해줘.
필요한 내용은 이미지를 생성하기 위한 프롬프트, 캡션입니다.

ㅇ JSON 형식으로 생성해주는데 aiPrompt, caption로 구성해줘.
- aiPrompt는 내용을 바탕으로 이미지 프롬프트를 작성해줘. 영문으로 작성해줘! 콘텐츠 타입과 브랜드 컬러를 반영해서 작성해줘.
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
    const contentSql = `SELECT a.aiPrompt, a.direction, a.imageSize, a.snsEvent, b.mainColor, c.imageList FROM content a
      LEFT JOIN contentRequest b ON a.fk_contentRequestId = b.id
      LEFT JOIN project c ON b.fk_projectId = c.id
      WHERE a.id = ?`;
    const contentResult = await queryAsync(contentSql, [id]);
    const { aiPrompt, direction, imageSize, snsEvent, mainColor, imageList } = contentResult[0];
    
    // Use individual imageSize if specified, otherwise use project default
    const imageRatio = imageSize || '1:1';
    
    // Enhance AI prompt with content type and color information
    let enhancedPrompt = aiPrompt;
    if (mainColor && !aiPrompt.toLowerCase().includes(mainColor.toLowerCase())) {
      // Extract hex color if mainColor is in format "Color Name, #HEX"
      const hexMatch = mainColor.match(/#[0-9A-Fa-f]{6}/);
      const colorHint = hexMatch ? hexMatch[0] : mainColor;
      enhancedPrompt = `${aiPrompt}. Use ${mainColor} as a theme color accent in the design.`;
    }

    let imageUrl = "";
    let imageToken = 0;
    
    // Fast retry logic for rate limit errors
    const maxRetries = 1; // Single retry for speed
    let retryCount = 0;
    
    while (retryCount <= maxRetries) {
      try {
        if (imageList === "") {
          const imageResult = await gptImageCreate({
            prompt: enhancedPrompt,
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
            prompt: enhancedPrompt,
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
  let { projectId } = req.query as { projectId: string };

  try {
    // Extract base project ID if it contains content request suffix
    if (projectId.includes('_cr')) {
      projectId = projectId.split('_cr')[0];
    }

    const contentRequestSql = `SELECT id FROM contentRequest
      WHERE fk_projectId = ?
      ORDER BY id DESC
      LIMIT 1`;
    const contentRequestResult = await queryAsync(contentRequestSql, [
      decodeHashId(projectId),
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
  const userId = req.user?.id;

  try {
    // Check if user can edit content
    if (userId) {
      const canEdit = await canUserPerformAction(userId, 'edit_content');
      if (!canEdit.allowed) {
        return res.status(403).json({
          message: canEdit.reason || '오늘의 수정 한도에 도달했습니다.',
          remainingToday: canEdit.remaining || 0
        });
      }
    }

    const updateSql = `UPDATE content SET caption = ? WHERE id = ?`;
    await queryAsync(updateSql, [caption, contentId]);

    // Track the content edit
    if (userId) {
      // Get the project ID for this content
      const contentResult = await queryAsync(
        `SELECT cr.fk_projectId, p.fk_brandId 
         FROM content c 
         JOIN contentRequest cr ON c.fk_contentRequestId = cr.id 
         JOIN project p ON cr.fk_projectId = p.id
         WHERE c.id = ?`,
        [contentId]
      );
      
      if (contentResult && contentResult.length > 0) {
        const { fk_projectId, fk_brandId } = contentResult[0];
        await trackUsage(userId, 'content_edit', fk_projectId, contentId, fk_brandId);
      }
    }

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
    // Check if user can edit content
    if (userId) {
      const canEdit = await canUserPerformAction(userId, 'edit_content');
      if (!canEdit.allowed) {
        return res.status(403).json({
          message: canEdit.reason || '오늘의 수정 한도에 도달했습니다.',
          remainingToday: canEdit.remaining || 0
        });
      }
    }

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
      
      // Track the content edit
      if (userId) {
        const projectInfo = await queryAsync(
          `SELECT cr.fk_projectId, p.fk_brandId 
           FROM content c 
           JOIN contentRequest cr ON c.fk_contentRequestId = cr.id 
           JOIN project p ON cr.fk_projectId = p.id
           WHERE c.id = ?`,
          [contentId]
        );
        
        if (projectInfo && projectInfo.length > 0) {
          const { fk_projectId, fk_brandId } = projectInfo[0];
          await trackUsage(userId, 'content_edit', fk_projectId, contentId, fk_brandId);
        }
      }
      
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
        
        // Track the content edit
        if (userId) {
          const projectInfo = await queryAsync(
            `SELECT cr.fk_projectId, p.fk_brandId 
             FROM content c 
             JOIN contentRequest cr ON c.fk_contentRequestId = cr.id 
             JOIN project p ON cr.fk_projectId = p.id
             WHERE c.id = ?`,
            [contentId]
          );
          
          if (projectInfo && projectInfo.length > 0) {
            const { fk_projectId, fk_brandId } = projectInfo[0];
            await trackUsage(userId, 'content_edit', fk_projectId, contentId, fk_brandId);
          }
        }
        
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
        
        // Track the content edit
        if (userId) {
          const projectInfo = await queryAsync(
            `SELECT cr.fk_projectId, p.fk_brandId 
             FROM content c 
             JOIN contentRequest cr ON c.fk_contentRequestId = cr.id 
             JOIN project p ON cr.fk_projectId = p.id
             WHERE c.id = ?`,
            [contentId]
          );
          
          if (projectInfo && projectInfo.length > 0) {
            const { fk_projectId, fk_brandId } = projectInfo[0];
            await trackUsage(userId, 'content_edit', fk_projectId, contentId, fk_brandId);
          }
        }
        
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
      // For auto generation, use 'all' column
      const columnName = requestType === 'auto' ? 'all' : requestType;
      const insertSql = `INSERT INTO regenerateLog(fk_userId, \`${columnName}\`, createdAt) VALUES(?, ?, NOW())`;
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

// Image scraping OPTIONS handler for preflight requests
router.options("/scrape-images", function (req, res) {
  const origin = req.headers.origin || 'https://main.dpvdj8dsmc7us.amplifyapp.com';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Cookie, x-session-token');
  res.status(200).end();
});

// Image scraping endpoint
router.post("/scrape-images", async function (req, res) {
  console.log('🔍 [SCRAPE-IMAGES] Request started');
  console.log('🔍 [SCRAPE-IMAGES] Headers:', {
    origin: req.headers.origin,
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length'],
    'x-session-token': req.headers['x-session-token'] ? 'Present' : 'Missing'
  });
  
  // Set timeout for this endpoint
  req.setTimeout(120000); // 2 minutes timeout
  res.setTimeout(120000); // 2 minutes timeout
  
  // Ensure CORS headers are set early
  try {
    const origin = req.headers.origin || 'https://main.dpvdj8dsmc7us.amplifyapp.com';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Cookie, x-session-token');
    console.log('✅ [SCRAPE-IMAGES] CORS headers set successfully');
  } catch (corsError) {
    console.error('❌ [SCRAPE-IMAGES] Failed to set CORS headers:', corsError);
  }
  
  // Call the original controller
  return scrapeImagesController(req, res);
});



// Brand summary OPTIONS handler for preflight requests
router.options("/brand-summary", function (req, res) {
  const origin = req.headers.origin || 'https://main.dpvdj8dsmc7us.amplifyapp.com';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Cookie, x-session-token');
  res.status(200).end();
});

// Brand summary generation endpoint
router.post("/brand-summary", async function (req: any, res: any) {
  console.log('🔍 [BRAND-SUMMARY] Request started');
  console.log('🔍 [BRAND-SUMMARY] Headers:', {
    origin: req.headers.origin,
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length'],
    'x-session-token': req.headers['x-session-token'] ? 'Present' : 'Missing'
  });
  
  // Set timeout for this endpoint
  req.setTimeout(60000); // 60 seconds timeout
  
  // Ensure CORS headers are set early
  try {
    const origin = req.headers.origin || 'https://main.dpvdj8dsmc7us.amplifyapp.com';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Cookie, x-session-token');
    console.log('✅ [BRAND-SUMMARY] CORS headers set successfully');
  } catch (corsError) {
    console.error('❌ [BRAND-SUMMARY] Failed to set CORS headers:', corsError);
  }
  
  const userId = req.user?.id;
  const brandInput = req.body;

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
    brandInput.selectedImages.forEach((image: any, index: number) => {
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
    
    // Check request body size
    const requestBodySize = JSON.stringify(brandInput).length;
    console.log(`📏 [BRAND-SUMMARY] Request body size: ${requestBodySize} bytes (${(requestBodySize / 1024 / 1024).toFixed(2)} MB)`);
    
    if (requestBodySize > 50 * 1024 * 1024) { // 50MB request limit
      console.error('❌ [BRAND-SUMMARY] Request body too large');
      return res.status(413).json({ error: 'Request body too large. Please select fewer images.' });
    }
    
    // Generate brand summary
    let brandSummary;
    try {
      console.log('📊 [BRAND-SUMMARY] Calling generateBrandChatter with:', {
        brandName: brandInput.brandName,
        userName,
        hasApiKey: !!openaiApiKey
      });
      brandSummary = await generateBrandChatter(brandInput, userName, openaiApiKey);
    } catch (genError) {
      console.error('❌ [BRAND-SUMMARY] generateBrandChatter failed:', genError);
      throw genError;
    }

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
    
    // Check if headers were already sent
    if (res.headersSent) {
      console.error('❌ [BRAND-SUMMARY] Headers were already sent!');
      return;
    }
    
    // Try to send error response with CORS headers
    try {
      const origin = req.headers.origin || 'https://main.dpvdj8dsmc7us.amplifyapp.com';
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } catch (e) {
      console.error('❌ [BRAND-SUMMARY] Could not set CORS headers in error handler');
    }
    
    res.status(500).json({ 
      error: '브랜드 분석 중 오류가 발생했습니다.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete content request (feed set) endpoint
router.delete("/contentrequest/:contentRequestId", isLogin, async function (req, res) {
  console.log('[DELETE CONTENT REQUEST] Request started:', req.params.contentRequestId);
  
  try {
    const contentRequestId = parseInt(req.params.contentRequestId);
    const userId = req.user?.id;
    
    // Verify ownership through project
    const ownershipQuery = `
      SELECT cr.id, p.fk_userId, p.id as projectId 
      FROM contentRequest cr
      JOIN project p ON cr.fk_projectId = p.id
      WHERE cr.id = ?
    `;
    const result = await queryAsync(ownershipQuery, [contentRequestId]);
    
    if (!result || result.length === 0) {
      return res.status(404).json({ error: '콘텐츠 요청을 찾을 수 없습니다.' });
    }
    
    if (result[0].fk_userId !== userId) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }
    
    // Delete content first
    await queryAsync(`DELETE FROM content WHERE fk_contentRequestId = ?`, [contentRequestId]);
    
    // Delete content request
    await queryAsync(`DELETE FROM contentRequest WHERE id = ?`, [contentRequestId]);
    
    console.log(`[DELETE CONTENT REQUEST] Successfully deleted content request: ${contentRequestId}`);
    res.status(200).json({ message: '피드셋이 성공적으로 삭제되었습니다.' });
    
  } catch (error) {
    console.error('[DELETE CONTENT REQUEST] Error:', error);
    res.status(500).json({ error: '피드셋 삭제 중 오류가 발생했습니다.' });
  }
});

// Delete project endpoint
router.delete("/project/:projectId", isLogin, async function (req, res) {
  console.log('[DELETE PROJECT] Request started:', req.params.projectId);
  
  try {
    // Extract base project ID if it contains content request suffix
    let projectIdStr = req.params.projectId;
    if (projectIdStr.includes('_cr')) {
      projectIdStr = projectIdStr.split('_cr')[0];
      console.log('[DELETE PROJECT] Extracted base project ID:', projectIdStr);
    }
    
    const projectId = decodeHashId(projectIdStr);
    const userId = req.user?.id;
    
    console.log('[DELETE PROJECT] Decoded projectId:', projectId);
    console.log('[DELETE PROJECT] User ID:', userId);
    
    if (!userId) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    
    if (!projectId || projectId === null) {
      return res.status(400).json({ error: '잘못된 프로젝트 ID입니다.' });
    }
    
    // Verify project ownership
    const ownershipQuery = `SELECT fk_userId, fk_brandId FROM project WHERE id = ?`;
    const projectResult = await queryAsync(ownershipQuery, [projectId]);
    
    if (!projectResult || projectResult.length === 0) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    }
    
    if (projectResult[0].fk_userId !== userId) {
      return res.status(403).json({ error: '프로젝트 삭제 권한이 없습니다.' });
    }
    
    const brandId = projectResult[0].fk_brandId;
    
    // Delete related data in order (to respect foreign key constraints)
    // 1. Delete from notification table (if it exists)
    try {
      await queryAsync(`DELETE FROM notification WHERE fk_projectId = ?`, [projectId]);
    } catch (e: any) {
      if (e.code !== 'ER_NO_SUCH_TABLE') {
        throw e;
      }
      console.log('[DELETE PROJECT] Notification table does not exist, skipping...');
    }
    
    // 2. Delete from request table (if it exists)
    try {
      await queryAsync(`DELETE FROM request WHERE fk_projectId = ?`, [projectId]);
    } catch (e: any) {
      if (e.code !== 'ER_NO_SUCH_TABLE') {
        throw e;
      }
      console.log('[DELETE PROJECT] Request table does not exist, skipping...');
    }
    
    // 3. Delete from content table first (references contentrequest)
    try {
      // First find all contentrequest IDs for this project
      const contentRequests = await queryAsync(
        `SELECT id FROM contentRequest WHERE fk_projectId = ?`,
        [projectId]
      );
      
      // Delete content entries that reference these contentrequest IDs
      for (const cr of contentRequests) {
        await queryAsync(`DELETE FROM content WHERE fk_contentRequestId = ?`, [cr.id]);
      }
      console.log('[DELETE PROJECT] Deleted from content table');
    } catch (e: any) {
      if (e.code === 'ER_NO_SUCH_TABLE') {
        console.log('[DELETE PROJECT] Content or contentrequest table does not exist, skipping...');
      }
    }
    
    // 4. Delete from contentrequest table (if it exists)
    try {
      await queryAsync(`DELETE FROM contentRequest WHERE fk_projectId = ?`, [projectId]);
      console.log('[DELETE PROJECT] Deleted from contentrequest table');
    } catch (e: any) {
      if (e.code !== 'ER_NO_SUCH_TABLE') {
        throw e;
      }
      console.log('[DELETE PROJECT] Contentrequest table does not exist, skipping...');
    }
    
    // 5. Delete from project table
    await queryAsync(`DELETE FROM project WHERE id = ?`, [projectId]);
    
    console.log(`[DELETE PROJECT] Successfully deleted project: ${projectId}`);
    res.status(200).json({ message: '프로젝트가 성공적으로 삭제되었습니다.' });
    
  } catch (error) {
    console.error('[DELETE PROJECT] Error:', error);
    res.status(500).json({ error: '프로젝트 삭제 중 오류가 발생했습니다.' });
  }
});

// Single image generation endpoint
router.post("/single-image", isLogin, async function (req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }
    
    const userId = req.user.id;
    const { concept, brandId } = req.body;
    
    if (!concept || !brandId) {
      return res.status(400).json({ error: '필수 데이터가 누락되었습니다.' });
    }

    // Get project data
    const projectSql = `SELECT * FROM project WHERE id = ? AND fk_userId = ?`;
    const projectResult = await queryAsync(projectSql, [brandId, userId]);
    
    if (!projectResult || projectResult.length === 0) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    }
    
    const project = projectResult[0];
    
    // Create content request record
    const contentRequestSql = `
      INSERT INTO contentRequest (
        fk_projectId,
        contentNum,
        dateOrder,
        status,
        created_at
      ) VALUES (?, 1, NOW(), 'pending', NOW())
    `;
    
    const contentRequestResult = await queryAsync(contentRequestSql, [brandId]);
    const contentRequestId = contentRequestResult.insertId;
    
    try {
      // Generate enhanced prompt for DALL-E
      const imagePrompt = `
${concept.imageDescription}

브랜드: ${project.name}
스타일: ${concept.contentType}
톤앤매너: 모던하고 세련된
핵심 메시지: ${concept.coreMessage}

인스타그램 피드용 고품질 이미지, 프로페셔널한 상업 사진 스타일
      `.trim();

      // Generate image using DALL-E
      // Map custom sizes to supported DALL-E sizes
      let imageSize: "1024x1024" | "1024x1536" | "1536x1024" = "1024x1024";
      if (concept.imageSize === '4:5' || concept.imageSize === '3:4') {
        imageSize = "1024x1536"; // Use portrait orientation for 4:5 and 3:4
      } else if (concept.imageSize === '16:9') {
        imageSize = "1536x1024"; // Use landscape orientation for 16:9
      }
      
      const imageResult = await gptImageCreate({
        prompt: imagePrompt,
        saveImageName: `single_${createHashId(contentRequestId)}`,
        size: imageSize
      });

      // Create content record
      const contentSql = `
        INSERT INTO content (
          id,
          fk_contentRequestId,
          description,
          hashtag,
          image,
          imageToken,
          snsEvent,
          textToken,
          title,
          contentType,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `;
      
      const contentId = createHashId(contentRequestId);
      await queryAsync(contentSql, [
        contentId,
        contentRequestId,
        concept.caption,
        concept.hashtags,
        imageResult.imageUrl,
        imageResult.token || 0,
        concept.snsEvent ? 1 : 0,
        0,
        concept.title,
        concept.contentType,
      ]);

      // Update content request status
      await queryAsync(
        `UPDATE contentRequest SET status = 'completed' WHERE id = ?`,
        [contentRequestId]
      );

      res.status(200).json({
        success: true,
        message: '이미지가 성공적으로 생성되었습니다.',
        contentId: contentId,
        imageUrl: imageResult.imageUrl
      });

    } catch (error) {
      // Update status to failed if image generation fails
      await queryAsync(
        `UPDATE contentRequest SET status = 'failed' WHERE id = ?`,
        [contentRequestId]
      );
      throw error;
    }

  } catch (error) {
    console.error('[SINGLE IMAGE] Error:', error);
    res.status(500).json({ error: '이미지 생성 중 오류가 발생했습니다.' });
  }
});

// Get user's usage limits
router.get('/usage-limits', isLogin, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: '로그인이 필요합니다.' });
    }

    const limits = await getUserUsageLimits(userId);
    
    res.json({
      success: true,
      limits: {
        projects: {
          remaining: limits.projectsRemaining,
          canCreate: limits.canCreateProject
        },
        singleImages: {
          remaining: limits.singleImagesRemaining,
          canCreate: limits.canCreateSingleImage
        },
        edits: {
          remainingToday: limits.editsRemainingToday,
          canEdit: limits.canEditContent
        }
      }
    });
  } catch (error) {
    console.error('Error getting usage limits:', error);
    res.status(500).json({ message: '사용 한도 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
