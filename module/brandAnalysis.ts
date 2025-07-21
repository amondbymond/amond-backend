import OpenAI from 'openai';

// Frontend data interface
interface BrandInput {
  brandName: string;
  category: string;
  reasons: string[];
  description: string;
  hasUrl: boolean | null;
  url: string;
  selectedImages: Array<{
    fileName: string;
    type: 'manual' | 'scraped';
    index: number;
    base64?: string;
    url?: string;
  }>;
  imageCount: number;
}

// Content type mappings by category
const CONTENT_TYPES = {
  '뷰티/미용': [
    '효능 강조', '사용 후기', '신제품 소개', '이벤트', '성분 스토리',
    '사용법 공유', '브랜드 무드', '뷰티 꿀팁', '챌린지', '인플루언서'
  ],
  '미식/푸드': [
    '메뉴 소개', '후기 리그램', '시즌 메뉴', '할인 이벤트', '공간 무드',
    '레시피 공유', '운영 안내', '고객 인증샷', '음식 철학', '비하인드'
  ],
  '일상/트렌드': [
    '일상 공유', '감성 무드', '트렌드 밈', '팔로워 소통', 'Q&A',
    '챌린지', '루틴 공개', '투표 유도', '공감 한줄', '소소한 팁'
  ],
  '패션': [
    '착장 소개', '신상 오픈', '스타일링팁', '할인 공지', '후기 공유',
    '룩북 공개', '브랜드 무드', '소재 강조', '착용샷', '촬영 비하인드'
  ],
  '자기개발': [
    '인사이트', '동기부여', '후기 인증', '강의 소개', '꿀팁 요약',
    '브랜딩 강조', '체크리스트', '컨설팅 홍보', '일상 회고', '성장 스토리'
  ],
  '지식 콘텐츠': [
    '트렌드 요약', '뉴스 큐레이션', '카드뉴스', '인포그래픽', '데이터 요약',
    '개념 정리', '퀴즈', '세미나 홍보', '용어 해설', '브리핑'
  ],
  '건강/헬스': [
    '운동 루틴', '후기 사례', '클래스 안내', '식단 공유', '헬스 꿀팁',
    '자기관리', '감성 인용', '무료 체험', '공간 소개', '전문가 소개'
  ],
  '기타': [
    '서비스/상품 소개', '창업 스토리', '기능 강조', '팔로우 이벤트', '후기 공유',
    '가치 전달', '협업 공개', 'Q&A', '무드컷', '제품 안내'
  ]
} as const;

// AI-only response interface (what AI needs to fill)
interface AIAnalysisFields {
  brandAnalysis: string;        // Brand analysis content only
  brandStrengths: string;       // Key strengths
  coreProductName: string;      // Core product/service name
  coreProductDescription: string; // Core product description
  targetAudience: string;       // Target audience
  targetDescription: string;    // Target audience description
  imageAnalysis: string;        // Image analysis results
  visualStyle: string;          // Visual style description
  mainColorHex: string;         // Main color in hex format
  colorPalette: string[];       // Color palette in hex
  contentType1: string;         // Must be from available content types
  contentType2: string;         // Must be from available content types
  contentType3: string;         // Must be from available content types
  contentType4: string;         // Must be from available content types
  conclusion: string;           // Final conclusion content only
}

// Complete response interface
interface BrandAnalysisResponse extends AIAnalysisFields {
  userName: string;
  brandName: string;
  category: string;
  reasons: string[];
  formattedText: string;        // The final templated text
}

class SmartBrandChatter {
  private openai: OpenAI;
  private userName: string;

  constructor(openaiApiKey: string, userName: string) {
    this.openai = new OpenAI({
      apiKey: openaiApiKey,
    });
    this.userName = userName;
  }

  async generateBrandSummary(brandInput: BrandInput): Promise<BrandAnalysisResponse> {
    try {
      // Get content types for the category
      const availableContentTypes = CONTENT_TYPES[brandInput.category as keyof typeof CONTENT_TYPES] || CONTENT_TYPES['기타'];
      
      // Create AI prompt with clear instructions
      const aiPrompt = this.createFocusedPrompt(brandInput, availableContentTypes);
      
      // Prepare messages for AI
      const messages: any[] = [
        {
          role: "system",
          content: this.getSystemPrompt(brandInput, availableContentTypes)
        },
        {
          role: "user",
          content: aiPrompt
        }
      ];

      // Add images to the conversation if available
      if (brandInput.selectedImages && brandInput.selectedImages.length > 0) {
        for (const image of brandInput.selectedImages.slice(0, 4)) {
          if (image.base64) {
            messages.push({
              role: "user",
              content: [
                {
                  type: "text",
                  text: `이미지 분석용 (${image.fileName}):`
                },
                {
                  type: "image_url",
                  image_url: {
                    url: image.base64,
                    detail: "low"
                  }
                }
              ]
            });
          } else if (image.url) {
            messages.push({
              role: "user",
              content: [
                {
                  type: "text",
                  text: `이미지 분석용 (${image.fileName}):`
                },
                {
                  type: "image_url",
                  image_url: {
                    url: image.url,
                    detail: "low"
                  }
                }
              ]
            });
          }
        }
      }

      // Get AI analysis
      const aiResponse = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        max_tokens: 1200,
        temperature: 0.7
      });

      const aiResponseText = aiResponse.choices[0]?.message?.content || '{}';
      
      // Parse AI response
      let aiFields: AIAnalysisFields;
      try {
        const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : '{}';
        const parsedResponse = JSON.parse(jsonString);
        
        aiFields = {
          brandAnalysis: parsedResponse.brandAnalysis || "혁신적이고 독창적인 브랜드입니다",
          brandStrengths: parsedResponse.brandStrengths || "차별화된 서비스가 회사의 큰 장점인 것 같아요",
          coreProductName: parsedResponse.coreProductName || brandInput.brandName,
          coreProductDescription: parsedResponse.coreProductDescription || "고품질 서비스를 제공합니다",
          targetAudience: parsedResponse.targetAudience || "품질을 중시하는 고객층",
          targetDescription: parsedResponse.targetDescription || "브랜드 가치를 이해하는 고객들입니다",
          imageAnalysis: parsedResponse.imageAnalysis || "깔끔하고 전문적인 이미지들로 구성되어 있습니다",
          visualStyle: parsedResponse.visualStyle || "모던하고 세련된 스타일",
          mainColorHex: parsedResponse.mainColorHex || "Indigo Purple, #6366F1",
          colorPalette: this.validateColorPalette(parsedResponse.colorPalette) || ["#6366F1", "#8B5CF6", "#EC4899"],
          contentType1: this.validateContentType(parsedResponse.contentType1, availableContentTypes) || availableContentTypes[0],
          contentType2: this.validateContentType(parsedResponse.contentType2, availableContentTypes) || availableContentTypes[1],
          contentType3: this.validateContentType(parsedResponse.contentType3, availableContentTypes) || availableContentTypes[2],
          contentType4: this.validateContentType(parsedResponse.contentType4, availableContentTypes) || availableContentTypes[3],
          conclusion: parsedResponse.conclusion || "앞으로도 브랜드만의 독특한 매력을 어필할 수 있을 것 같아요"
        };
      } catch (parseError) {
        console.error('JSON parsing failed:', parseError);
        aiFields = this.createFallbackAIFields(brandInput, availableContentTypes);
      }
      
      // Generate the formatted text using our static template
      const formattedText = this.generateFormattedText(brandInput, aiFields);
      
      // Create complete response
      const result: BrandAnalysisResponse = {
        // Static frontend data
        userName: this.userName,
        brandName: brandInput.brandName,
        category: brandInput.category,
        reasons: brandInput.reasons,
        
        // AI-generated content
        ...aiFields,
        
        // Final formatted template
        formattedText: formattedText
      };
      
      console.log('🎯 DEBUG: Final response being returned to frontend:');
      console.log('📊 Brand Analysis Response:', JSON.stringify(result, null, 2));
      
      return result;
      
    } catch (error) {
      console.error('❌ ERROR: Error generating brand summary:', error);
      throw new Error('AI 분석 중 오류가 발생했습니다.');
    }
  }

  private getSystemPrompt(brandInput: BrandInput, availableContentTypes: readonly string[]): string {
    return `당신은 브랜드 마케팅 전문가입니다. 주어진 브랜드 정보와 이미지를 분석하여 다음 JSON 형식으로만 응답해주세요.

정확히 이 형식으로 응답하세요:
{
  "brandAnalysis": "브랜드 분석 내용 (브랜드명 없이 분석만)",
  "brandStrengths": "브랜드 장점 ",
  "coreProductName": "핵심 상품/서비스명",
  "coreProductDescription": "핵심 상품 설명 (한 문장)",
  "targetAudience": "타겟 고객층",
  "targetDescription": "타겟 고객 상세 설명",
  "imageAnalysis": "이미지 분석 결과",
  "visualStyle": "시각적 스타일",
  "mainColorHex": "메인 컬러 (반드시 '전문적인 색상명, #헥스코드' 형식, 예: Soft Cyan, #00CED1)",
  "colorPalette": ["색깔1", "색깔2", "색깔3"],
  "contentType1": "콘텐츠 타입 1",
  "contentType2": "콘텐츠 타입 2", 
  "contentType3": "콘텐츠 타입 3",
  "contentType4": "콘텐츠 타입 4",
  "conclusion": "마무리 멘트 (브랜드명 없이 내용만)"
}

중요 규칙:
1. contentType1-4는 반드시 다음 목록에서만 선택: ${availableContentTypes.join(', ')}
2. mainColorHex는 반드시 '전문적인 색상명, #헥스코드' 형식으로 작성 (예: Soft Cyan, #00CED1)
3. colorPalette의 그냥 자연어로 색깔
4. brandAnalysis와 conclusion에는 브랜드명을 포함하지 마세요
5. 모든 응답은 한국어로, 친근하고 자연스러운 톤으로 작성

이미지가 제공된 경우 이미지 분석을 적극 활용하여 정확한 브랜드 분석을 해주세요.`;
  }

  private createFocusedPrompt(brandInput: BrandInput, availableContentTypes: readonly string[]): string {
    return `브랜드 분석 요청:

브랜드 정보:
- 브랜드명: ${brandInput.brandName}
- 카테고리: ${brandInput.category}
- 운영 목적: ${brandInput.reasons.join(', ')}
- 브랜드 설명: ${brandInput.description}
- 이미지 개수: ${brandInput.imageCount}개

분석 요청:
1. 이 브랜드의 핵심 특징과 포지셔닝 분석
2. 브랜드의 가장 큰 장점 파악
3. 주요 상품/서비스와 타겟 고객 정의
4. 이미지 기반 시각적 분석 (색상, 스타일)
5. 브랜드에 어울리는 메인 컬러 추천
6. 효과적인 콘텐츠 전략 4가지 선택 (위 목록에서만)

위의 모든 분석 결과를 JSON 형식으로 정리해주세요.`;
  }

  private generateFormattedText(brandInput: BrandInput, aiFields: AIAnalysisFields): string {
    // Static template with AI-filled content
    let template = `${this.userName}님이 적어주신 이야기, 이렇게 요약해봤어요. ✨

• 당신의 상품명은 ${brandInput.brandName}
• 선택하신 브랜드는 [${brandInput.reasons.join(', ')}]를 운영 목적으로 ${brandInput.category} 카테고리네요!

당신의 브랜드 ${brandInput.brandName}는 ${aiFields.brandAnalysis}

• 회사의 장점 → ${aiFields.brandStrengths}
• 중심 상품은 [${aiFields.coreProductName}] → ${aiFields.coreProductDescription}
• 타겟 고객층은 [${aiFields.targetAudience}] → ${aiFields.targetDescription}`;

    // Add image analysis section if images were provided
    if (brandInput.selectedImages && brandInput.selectedImages.length > 0) {
      template += `

📸 이미지 분석 결과:
• 이미지들은 ${aiFields.imageAnalysis}
• 시각적 스타일: ${aiFields.visualStyle}
• 주요 색상: ${aiFields.colorPalette.join(', ')}`;
    }

    // Continue with rest of template
    template += `
저희가 생각하기엔 피드의 메인테마는 ${aiFields.mainColorHex}로 하는게 좋을 것 같아요!

이런 고객들에게 어필하기 위해서는 ${aiFields.contentType1}, ${aiFields.contentType2}, ${aiFields.contentType3}, ${aiFields.contentType4} 형식의 콘텐츠가 적절해 보입니다.

${brandInput.brandName}는 ${aiFields.conclusion}`;

    return template;
  }

  private extractHexColor(colorString: string): string | null {
    if (!colorString) return null;
    
    // Extract hex color from string (supports both "Color Name, #HEX" and "#HEX" formats)
    const hexMatch = colorString.match(/#[0-9A-Fa-f]{6}/);
    return hexMatch ? hexMatch[0] : null;
  }

  private validateColorPalette(palette: any): string[] | null {
    if (!Array.isArray(palette)) return null;
    
    const validColors = palette.filter(color => 
      typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color)
    );
    
    return validColors.length >= 3 ? validColors.slice(0, 3) : null;
  }

  private validateContentType(contentType: string, availableTypes: readonly string[]): string | null {
    return availableTypes.includes(contentType) ? contentType : null;
  }

  private createFallbackAIFields(brandInput: BrandInput, availableContentTypes: readonly string[]): AIAnalysisFields {
    return {
      brandAnalysis: "혁신적이고 독창적인 브랜드입니다",
      brandStrengths: "차별화된 서비스가 회사의 큰 장점인 것 같아요",
      coreProductName: brandInput.brandName,
      coreProductDescription: "고품질 서비스를 제공합니다",
      targetAudience: "품질을 중시하는 고객층",
      targetDescription: "브랜드 가치를 이해하는 고객들입니다",
      imageAnalysis: "깔끔하고 전문적인 이미지들로 구성되어 있습니다",
      visualStyle: "모던하고 세련된 스타일",
      mainColorHex: "Indigo Purple, #6366F1",
      colorPalette: ["#6366F1", "#8B5CF6", "#EC4899"],
      contentType1: availableContentTypes[0],
      contentType2: availableContentTypes[1],
      contentType3: availableContentTypes[2],
      contentType4: availableContentTypes[3],
      conclusion: "앞으로도 브랜드만의 독특한 매력을 어필할 수 있을 것 같아요"
    };
  }
}

// Usage functions
export async function generateBrandChatter(
  brandInput: BrandInput,
  userName: string,
  openaiApiKey: string
): Promise<BrandAnalysisResponse> {
  const chatter = new SmartBrandChatter(openaiApiKey, userName);
  return await chatter.generateBrandSummary(brandInput);
}

// Helper function to get individual variables
export async function getBrandVariables(
  brandInput: BrandInput,
  userName: string,
  openaiApiKey: string
): Promise<{
  // Static template variables
  USERNAME: string;
  BRAND_NAME: string;
  CATEGORY: string;
  REASONS: string;
  
  // AI-generated variables
  BRAND_ANALYSIS: string;
  BRAND_STRENGTHS: string;
  CORE_PRODUCT_NAME: string;
  CORE_PRODUCT_DESC: string;
  TARGET_AUDIENCE: string;
  TARGET_DESC: string;
  MAIN_COLOR_HEX: string;
  IMAGE_ANALYSIS: string;
  VISUAL_STYLE: string;
  COLOR_PALETTE: string;
  CONTENT_TYPE_1: string;
  CONTENT_TYPE_2: string;
  CONTENT_TYPE_3: string;
  CONTENT_TYPE_4: string;
  CONCLUSION: string;
  
  // Final formatted template
  FORMATTED_TEXT: string;
}> {
  const result = await generateBrandChatter(brandInput, userName, openaiApiKey);
  
  const frontendVariables = {
    // Static data
    USERNAME: result.userName,
    BRAND_NAME: result.brandName,
    CATEGORY: result.category,
    REASONS: result.reasons.join(', '),
    
    // AI-generated content
    BRAND_ANALYSIS: result.brandAnalysis,
    BRAND_STRENGTHS: result.brandStrengths,
    CORE_PRODUCT_NAME: result.coreProductName,
    CORE_PRODUCT_DESC: result.coreProductDescription,
    TARGET_AUDIENCE: result.targetAudience,
    TARGET_DESC: result.targetDescription,
    MAIN_COLOR_HEX: result.mainColorHex,
    IMAGE_ANALYSIS: result.imageAnalysis,
    VISUAL_STYLE: result.visualStyle,
    COLOR_PALETTE: result.colorPalette.join(', '),
    CONTENT_TYPE_1: result.contentType1,
    CONTENT_TYPE_2: result.contentType2,
    CONTENT_TYPE_3: result.contentType3,
    CONTENT_TYPE_4: result.contentType4,
    CONCLUSION: result.conclusion,
    
    // Final formatted template
    FORMATTED_TEXT: result.formattedText
  };
  
  console.log('🎯 DEBUG: Frontend variables being returned:');
  console.log('📊 Frontend Variables:', JSON.stringify(frontendVariables, null, 2));
  
  return frontendVariables;
}

// Utility function to convert file to base64
export const convertFileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

// Export types
export type { BrandInput, BrandAnalysisResponse, AIAnalysisFields };