import express from 'express';
import OpenAI from 'openai';
import { isLogin } from '../module/needAuth';
import { queryAsync } from '../module/commonFunction';
import { s3 } from '../module/aws';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import moment from 'moment';
import { canUserPerformAction, trackUsage } from '../module/usageTracking';

const router = express.Router();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Generate AI concepts for single image creation
router.post('/generateSingleImageConcepts', isLogin, async (req, res) => {
  console.log('Single image concepts endpoint called');
  console.log('Request body:', req.body);
  console.log('User:', req.user);
  
  const { feedSetData, brandCategory, contentTypes } = req.body;

  if (!feedSetData || !brandCategory) {
    console.log('Missing required data:', { feedSetData: !!feedSetData, brandCategory: !!brandCategory });
    return res.status(400).json({ message: 'Missing required data' });
  }

  try {
    // Extract relevant information from feedSetData
    const { brandName, essentialKeyword, trendIssue, toneMannerList, directionList } = feedSetData;

    const prompt = `
[브랜드 정보]
브랜드명: ${brandName}
카테고리: ${brandCategory}
핵심 키워드: ${essentialKeyword || '없음'}
트렌드/이슈: ${trendIssue || '없음'}
톤&매너: ${toneMannerList || '모던하고 세련된'}
콘텐츠 방향성: ${directionList || '정보형'}

[과제]
위 브랜드를 위한 인스타그램 개별 피드 콘텐츠 5개를 기획해주세요.
각 콘텐츠는 브랜드의 정체성을 살리면서도 타겟 고객의 관심을 끌 수 있는 독창적이고 매력적인 내용이어야 합니다.

[필수 조건]
1. 각 콘텐츠는 다음 타입 중 하나를 선택: [${contentTypes.join(', ')}]
2. 5개 콘텐츠는 모두 다른 타입이어야 함
3. 시각적으로 매력적이고 인스타그램에 최적화된 이미지 설명
4. 한국 SNS 트렌드와 문화를 반영한 캡션과 해시태그
5. 브랜드 톤&매너를 일관되게 유지

[각 콘텐츠 템플릿 - 모든 필드를 반드시 작성]
{
  "title": "콘텐츠 제목 (10자 이내, 임팩트 있게)",
  "snsEvent": true/false (이벤트, 프로모션, 할인 등 참여형 콘텐츠면 true),
  "contentType": "선택한 콘텐츠 타입 (위 리스트에서 하나 선택)",
  "imageDescription": "생성할 이미지의 구체적인 묘사 (150자 이상) - 구도, 색감, 분위기, 주요 요소, 텍스트 오버레이 등을 상세히 설명. 예시: '배경에 파스텔톤 인테리어가 보이는 조용한 2인 테이블. 중앙에 아몬드 라떼가 놓여있고, 옆에는 노트북과 책이 자연스럽게 배치. 오른쪽 상단에 "신메뉴 출시" 텍스트 오버레이'",
  "coreMessage": "이 콘텐츠가 전달하고자 하는 핵심 메시지 (30자 이내). 예시: '아몬드가 9900원에 8월 런칭 프로모션을 합니다'",
  "hashtags": "#${brandName} 포함 총 10-15개의 관련 해시태그. 트렌디하고 검색 가능한 태그 위주. 예시: '#아몬드 #신메뉴출시 #커피스타그램 #카페추천 #일상스타그램 #커피맛집 #프로모션 #할인이벤트 #8월이벤트 #신상맛집 #커피러버 #데일리커피'",
  "caption": "매력적인 인스타그램 캡션 (200자 이상) - 스토리텔링, 이모지 활용, CTA(Call-to-Action) 포함. 첫 문장은 특히 눈길을 끌도록 작성. 문단 구분 필요시 줄바꿈 사용. 마지막에 행동 유도 문구 포함",
  "imageSize": "1:1" 또는 "4:5" 또는 "3:4" 또는 "16:9" (콘텐츠 특성에 맞는 최적 비율 선택)
}

[예시 - 카페 브랜드]
{
  "title": "여름 신메뉴 출시",
  "snsEvent": true,
  "contentType": "신제품 소개",
  "imageDescription": "밝은 자연광이 들어오는 카페 창가 테이블. 중앙에 아이스 아몬드 라떼가 투명한 유리잔에 담겨있고, 아몬드 시럽이 층을 이루며 그라데이션 효과. 옆에는 신선한 아몬드와 민트 잎이 장식으로 배치. 배경은 살짝 블러 처리된 카페 내부. 왼쪽 상단에 '여름 한정' 스티커 효과",
  "coreMessage": "시원한 아몬드 라떼로 무더위를 날려보세요",
  "hashtags": "#아몬드카페 #여름신메뉴 #아이스아몬드라떼 #카페스타그램 #신메뉴출시 #여름음료 #카페추천 #일상스타그램 #커피맛집 #한정메뉴 #무더위탈출 #시원한음료 #데일리커피 #카페라떼",
  "caption": "🌞 무더운 여름, 시원~한 신메뉴가 찾아왔어요!\n\n고소한 아몬드와 부드러운 우유가 만나 탄생한 '아이스 아몬드 라떼' 🥤\n첫 모금부터 느껴지는 고소함과 시원함이 여름 더위를 싹 날려준답니다.\n\n✨ 8월 한정 특별 이벤트\n아이스 아몬드 라떼 30% 할인!\n정가 6,500원 → 4,550원\n\n서둘러주세요! 8월 31일까지만 진행됩니다 💛\n\n📍 매일 오전 8시 - 오후 10시\n📞 예약 및 문의: 02-1234-5678\n\n#아몬드카페 #여름신메뉴 #아이스아몬드라떼",
  "imageSize": "4:5"
}

응답은 반드시 다음 JSON 형식으로만 해주세요:
{
  "concepts": [5개의 콘텐츠 객체]
}`;

    const systemPrompt = `You are an expert social media content strategist with deep understanding of Korean Instagram marketing trends. You create viral, engaging content that drives brand awareness and customer engagement.

Key principles:
1. Deep understanding of Korean social media culture and trends
2. Visual storytelling expertise for Instagram
3. Balance between brand identity and audience appeal
4. Creative and unexpected content ideas that stand out

IMPORTANT: Respond with valid JSON only. No explanatory text before or after the JSON.
The response must be a JSON object with a "concepts" array containing exactly 5 unique, creative content concepts.`;

    console.log('Calling OpenAI API...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',  // Using GPT-4o for better performance and speed
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: prompt + '\n\nRemember to respond with JSON only, starting with { and ending with }',
        },
      ],
      temperature: 0.7,  // Slightly lower for more consistent output
      response_format: { type: "json_object" },  // Force JSON response
    });

    const responseText = completion.choices[0].message.content || '';
    console.log('Raw AI response length:', responseText.length);
    console.log('First 200 chars:', responseText.substring(0, 200));
    
    // Clean the response text to ensure valid JSON
    let cleanedResponse = responseText.trim();
    
    // Remove any markdown code blocks if present
    cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    // Remove any BOM or zero-width characters
    cleanedResponse = cleanedResponse.replace(/^\uFEFF/, '').replace(/\u200B/g, '');
    
    // Find the first { and last } to extract just the JSON
    const firstBrace = cleanedResponse.indexOf('{');
    const lastBrace = cleanedResponse.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
      console.error('No valid JSON object found in response:', cleanedResponse);
      throw new Error('Invalid response format from AI - no JSON object found');
    }
    
    cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1);
    
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse AI response:', cleanedResponse);
      console.error('Parse error details:', parseError);
      
      // Try to fix common JSON issues
      try {
        // Replace smart quotes with regular quotes
        let fixedResponse = cleanedResponse
          .replace(/[\u2018\u2019]/g, "'")
          .replace(/[\u201C\u201D]/g, '"');
        
        parsedResponse = JSON.parse(fixedResponse);
      } catch (secondParseError) {
        throw new Error('Invalid response format from AI - JSON parsing failed');
      }
    }
    
    // Validate response structure
    if (!parsedResponse || typeof parsedResponse !== 'object') {
      throw new Error('Invalid response format from AI - not an object');
    }
    
    // Ensure we have an array of concepts
    const concepts = parsedResponse.concepts || parsedResponse.items || [];
    
    if (!Array.isArray(concepts)) {
      console.error('Concepts is not an array:', concepts);
      throw new Error('Invalid response format from AI - concepts is not an array');
    }
    
    if (concepts.length === 0) {
      throw new Error('No concepts generated by AI');
    }
    
    // Validate each concept has required fields
    const requiredFields = ['title', 'snsEvent', 'contentType', 'imageDescription', 'coreMessage', 'hashtags', 'caption', 'imageSize'];
    concepts.forEach((concept, index) => {
      requiredFields.forEach(field => {
        if (!(field in concept)) {
          console.error(`Concept ${index} missing required field: ${field}`, concept);
          throw new Error(`Invalid concept format - missing required field: ${field}`);
        }
      });
    });
    
    // Add IDs to each concept
    const conceptsWithIds = concepts.map((concept: any, index: number) => ({
      id: index + 1,
      ...concept,
    }));

    res.json({
      concepts: conceptsWithIds,
    });
  } catch (error) {
    console.error('Error generating single image concepts:', error);
    res.status(500).json({ 
      message: 'AI 컨셉 생성 중 오류가 발생했습니다',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Generate single image based on selected concept
router.post('/generateSingleImage', isLogin, async (req, res) => {
  const { concept, brandId } = req.body;
  const userId = req.user?.id;

  if (!concept || !brandId || !userId) {
    return res.status(400).json({ message: 'Missing required data' });
  }

  try {
    // Check if user can create a single image
    const canCreate = await canUserPerformAction(userId, 'create_single_image');
    if (!canCreate.allowed) {
      return res.status(403).json({
        message: canCreate.reason || '개별 이미지 생성 한도에 도달했습니다.',
        remaining: canCreate.remaining || 0
      });
    }
    // Generate image using DALL-E 3
    const imagePrompt = `${concept.imageDescription}. Style: professional social media content for ${concept.contentType} category, ${concept.imageSize} aspect ratio, high quality, modern aesthetic`;

    const imageResponse = await openai.images.generate({
      model: 'dall-e-3',
      prompt: imagePrompt,
      n: 1,
      size: concept.imageSize === '1:1' ? '1024x1024' : '1024x1792',
      quality: 'standard',
    });

    const dalleImageUrl = imageResponse.data?.[0]?.url;
    
    if (!dalleImageUrl) {
      throw new Error('Failed to generate image');
    }

    // Download the image from DALL-E
    const imageResponse2 = await axios.get(dalleImageUrl, {
      responseType: 'arraybuffer'
    });
    
    // Generate filename for S3
    const currentTime = moment().locale('en').format('YYYYMMDD_hhmmss_a');
    const fileName = `single_image_${currentTime}_${brandId}_${userId}.png`;
    const s3Key = `single-images/${fileName}`;
    
    // Upload to S3
    const uploadCommand = new PutObjectCommand({
      Bucket: 'amond-image',
      Key: s3Key,
      Body: Buffer.from(imageResponse2.data),
      ContentType: 'image/png',
    });
    
    await s3.send(uploadCommand);
    
    // Use the S3 key as imageUrl (not the full URL)
    const imageUrl = s3Key;

    // Get the project ID for this brand, or any project for the user
    let projectId: number;
    let projectSql = `SELECT id FROM project WHERE fk_brandId = ? LIMIT 1`;
    let projectResult = await queryAsync(projectSql, [brandId]);
    
    // If no project found for brand, try to get any project for the user
    if (!projectResult || projectResult.length === 0) {
      projectSql = `SELECT id FROM project WHERE fk_userId = ? LIMIT 1`;
      projectResult = await queryAsync(projectSql, [userId]);
    }
    
    if (!projectResult || projectResult.length === 0) {
      // Create a new project for this brand if none exists
      const createProjectSql = `
        INSERT INTO project (
          name,
          sessionName,
          category,
          fk_userId,
          fk_brandId,
          createdAt,
          lastAccessedAt
        ) VALUES (?, ?, ?, ?, ?, NOW(), NOW())
      `;
      
      const projectName = 'Single Image Project';
      const sessionName = `${projectName} - ${moment().format('YYYY-MM-DD HH:mm')}`;
      
      // Get brand info for category
      const brandResult = await queryAsync(`SELECT category FROM brand WHERE id = ?`, [brandId]);
      const brandCategory = brandResult?.[0]?.category || '기타';
      
      const createResult = await queryAsync(createProjectSql, [
        projectName,
        sessionName,
        brandCategory,
        userId,
        brandId
      ]);
      
      projectId = createResult.insertId;
    } else {
      projectId = projectResult[0].id;
    }

    // First, create a contentRequest entry for this single image
    const contentRequestSql = `
      INSERT INTO contentRequest (
        trendIssue,
        essentialKeyword,
        directionList,
        toneMannerList,
        createdAt,
        fk_projectId
      ) VALUES (
        'Single Image Generation',
        ?,
        ?,
        ?,
        NOW(),
        ?
      )
    `;

    const contentRequestResult = await queryAsync(contentRequestSql, [
      concept.coreMessage || 'Single Image',
      concept.contentType,
      'Modern',
      projectId
    ]);

    const contentRequestId = contentRequestResult.insertId;

    // Calculate next week's date for the empty calendar slot
    const nextWeekDate = moment().add(7, 'days').format('YYYY-MM-DD 12:00:00');
    
    // Save to database as a single-image content
    const insertSql = `
      INSERT INTO content (
        postDate, 
        subject, 
        imageUrl, 
        caption, 
        aiPrompt,
        direction,
        snsEvent,
        imageSize,
        fk_contentRequestId,
        additionalText
      ) VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,  -- Use the contentRequestId we just created
        ?
      )
    `;

    const additionalData = JSON.stringify({
      contentType: concept.contentType,
      coreMessage: concept.coreMessage,
      hashtags: concept.hashtags,
      brandId: brandId,
      userId: userId,
      generatedAt: new Date().toISOString(),
    });

    const result = await queryAsync(insertSql, [
      nextWeekDate,
      concept.title,
      imageUrl,
      concept.caption,
      imagePrompt,
      concept.contentType,
      concept.snsEvent ? 1 : 0,
      concept.imageSize,
      contentRequestId,
      additionalData,
    ]);

    // Track the single image creation
    await trackUsage(userId, 'single_image_creation', projectId, result.insertId, brandId);

    res.json({
      success: true,
      contentId: result.insertId,
      imageUrl,
      concept,
    });
  } catch (error) {
    console.error('Error generating single image:', error);
    res.status(500).json({ 
      message: '이미지 생성 중 오류가 발생했습니다',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;