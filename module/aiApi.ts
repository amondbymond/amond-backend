import OpenAI, { toFile } from "openai";
import dotenv from "dotenv";
import { s3, uploadPresigned } from "./aws";
import { GetObjectCommand } from "@aws-sdk/client-s3";
dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3, // og default 2
});

/* gptChat */
export const gptChatCompletion = async ({
  model,
  role,
  messageHistory,
  prompt,
  max_tokens = 3000,
  isJson = false,
  webSearch = false,
  searchContextSize = "medium",
  userLocation = {
    country: "KR",
    timezone: "Asia/Seoul",
  },
}: {
  model?: string;
  role: string;
  messageHistory?: any;
  prompt: string;
  max_tokens?: number;
  isJson?: boolean;
  webSearch?: boolean;
  searchContextSize?: "low" | "medium" | "high";
  userLocation?: {
    country?: string;
    city?: string;
    region?: string;
    timezone?: string;
  };
}) => {
  try {
    const completion = await client.chat.completions.create({
      model: webSearch ? "gpt-4o-mini-search-preview" : model || "gpt-4.1-mini",
      messages:
        messageHistory && messageHistory?.length > 0
          ? [
              { role: "system", content: role },
              ...messageHistory,
              { role: "user", content: prompt },
            ]
          : [
              { role: "system", content: role },
              { role: "user", content: prompt },
            ],
      response_format:
        isJson && !webSearch ? { type: "json_object" } : undefined,
      max_tokens,
      ...(webSearch && {
        web_search_options: {
          search_context_size: searchContextSize,
          user_location: {
            type: "approximate",
            approximate: userLocation,
          },
        },
      }),
    });
    // console.log(completion);
    // console.log(completion?.choices);
    // console.log(completion.usage);

    return {
      message: isJson
        ? JSON.parse(completion.choices[0].message.content || "{}")
        : completion.choices[0].message.content,
      totalToken: completion.usage?.total_tokens,
    };
  } catch (error) {
    console.error("generateGPTAnswer 에러 발생 - ", error);
    throw error;
  }
};

/* GPT-Image-1 이미지 편집 */
export const gptImageEdit = async ({
  imageUrl,
  prompt,
  background = "auto",
  n = 1,
  quality = "medium", // 'low', 'medium', 'high', 'auto'
  size = "1024x1024", // '1024x1024', '1024x1536', '1536x1024', 'auto'
  saveImageName,
}: {
  imageUrl: string;
  prompt: string;
  background?: "auto" | "transparent" | "opaque" | null;
  n?: number;
  quality?: "auto" | "medium" | "standard" | "low" | "high" | null;
  size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto" | null;
  saveImageName: string;
}) => {
  try {
    // S3 URL에서 파일 경로 추출
    const key = imageUrl.replace(
      "https://amond-image.s3.ap-northeast-2.amazonaws.com/",
      ""
    );

    // S3에서 이미지 가져오기
    const command = new GetObjectCommand({
      Bucket: "amond-image",
      Key: key,
    });

    const response = await s3.send(command);
    const imageBuffer = await response.Body?.transformToByteArray();

    if (!imageBuffer) {
      throw new Error("이미지를 가져올 수 없습니다.");
    }

    // 고유한 임시 파일 생성
    const uniqueFileName = `gpt_image_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 15)}.png`;

    // ArrayBuffer를 File 객체로 변환
    const imageFile = await toFile(new Blob([imageBuffer]), uniqueFileName, {
      type: "image/png",
    });

    const editResponse = await client.images.edit({
      model: "gpt-image-1",
      image: imageFile,
      prompt,
      background,
      n,
      quality,
      size,
    });

    // 생성된 이미지를 S3에 저장
    if (editResponse?.data?.[0]?.b64_json) {
      const imageBuffer = Buffer.from(editResponse.data[0].b64_json, "base64");

      // 이미지 형식 감지
      let imageType = "png";
      const header = imageBuffer.slice(0, 4);
      if (header[0] === 0xff && header[1] === 0xd8) {
        imageType = "jpeg";
      }

      const fileName = `${saveImageName}.${imageType}`;

      // S3 업로드를 위한 presigned URL 생성
      const { url, entireDirectory } = await uploadPresigned({
        fileName,
        directory: "user/project/ai-generated",
      });

      // presigned URL을 사용하여 이미지 업로드
      await fetch(url, {
        method: "put",
        body: imageBuffer,
        headers: {
          "Content-Type": `image/${imageType}`,
        },
      });

      // S3 URL과 토큰 사용량 반환
      return {
        imageUrl: entireDirectory,
        token: editResponse.usage?.total_tokens || 0,
      };
    } else {
      console.error("이미지 편집 및 저장 실패", editResponse);
      throw new Error("이미지 편집 실패");
    }
  } catch (error: any) {
    if (error?.response) {
      // 429 에러면 로그 생략
      if (error?.response?.status !== 429) {
        console.log(
          "이미지 편집 에러(response)",
          error?.response?.data || error
        );
      }
    } else {
      console.log("이미지 편집 에러(message)", error?.message || error);
    }
    throw error;
  }
};

/* GPT-Image-1 이미지 생성 */
export const gptImageCreate = async ({
  prompt,
  n = 1,
  quality = "medium", // 'low', 'medium', 'high', 'auto'
  size = "1024x1024", // '1024x1024', '1024x1536', '1536x1024', 'auto'
  saveImageName,
}: {
  prompt: string;
  n?: number;
  quality?: "auto" | "medium" | "standard" | "low" | "high" | null;
  size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto" | null;
  saveImageName: string;
}) => {
  try {
    const createResponse = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      n,
      quality,
      size,
    });

    // 생성된 이미지를 S3에 저장
    if (createResponse?.data?.[0]?.b64_json) {
      const imageBuffer = Buffer.from(
        createResponse.data[0].b64_json,
        "base64"
      );

      // 이미지 형식 감지
      let imageType = "png";
      const header = imageBuffer.slice(0, 4);
      if (header[0] === 0xff && header[1] === 0xd8) {
        imageType = "jpeg";
      }

      const fileName = `${saveImageName}.${imageType}`;

      // S3 업로드를 위한 presigned URL 생성
      const { url, entireDirectory } = await uploadPresigned({
        fileName,
        directory: "user/project/ai-generated",
      });

      // presigned URL을 사용하여 이미지 업로드
      await fetch(url, {
        method: "put",
        body: imageBuffer,
        headers: {
          "Content-Type": `image/${imageType}`,
        },
      });

      // S3 URL과 토큰 사용량 반환
      return {
        imageUrl: entireDirectory,
        token: createResponse.usage?.total_tokens || 0,
      };
    } else {
      console.error("이미지 생성 및 저장 실패", createResponse);
      throw new Error("이미지 생성 실패");
    }
  } catch (error: any) {
    if (error?.response) {
      // 429 에러면 로그 생략
      if (error?.response?.status !== 429) {
        console.log(
          "이미지 생성 에러(response)",
          error?.response?.data || error
        );
      }
    } else {
      console.log("이미지 생성 에러(message)", error?.message || error);
    }
    throw error;
  }
};
