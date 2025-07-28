import moment from "moment";
import dotenv from "dotenv";
dotenv.config();
import {
  S3Client,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Debug: Check if environment variables are loaded
const awsAccessKey = process.env.AWS_ACCESS_KEY;
const awsSecretKey = process.env.AWS_SECRET_ACCESS;

console.log('AWS Environment Check:', {
  AWS_ACCESS_KEY: awsAccessKey ? `Set (${awsAccessKey.substring(0, 10)}...)` : 'Not set',
  AWS_SECRET_ACCESS: awsSecretKey ? 'Set' : 'Not set',
});

// Validate AWS credentials before creating S3 client
if (!awsAccessKey || !awsSecretKey) {
  console.error('CRITICAL: AWS credentials are not properly configured!');
  console.error('AWS_ACCESS_KEY:', awsAccessKey ? 'Present but empty' : 'Missing');
  console.error('AWS_SECRET_ACCESS:', awsSecretKey ? 'Present but empty' : 'Missing');
  console.error('Current environment:', process.env.NODE_ENV);
  console.error('All env vars:', Object.keys(process.env).filter(k => k.startsWith('AWS')));
}

const s3 = new S3Client({
  region: "ap-northeast-2", // 사용자 사용 지역 (서울의 경우 ap-northeast-2)
  credentials: {
    accessKeyId: awsAccessKey,
    secretAccessKey: awsSecretKey,
  },
  // Disable automatic checksum calculation
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

// 업로드 (presigned url)
const uploadPresigned = async ({
  fileName,
  directory,
  removeTime = false,
}: {
  fileName: string;
  directory: string;
  removeTime?: boolean;
}) => {
  const fileNameNFC = fileName.replace(/\s|\+/g, "_").normalize("NFC"); // 공백 및 +를 _로 대체, NFC 정규화
  const currentTime = moment().locale("en").format("YYYYMMDD_hhmmss_a");
  let entireDirectory = `${directory}/${currentTime}_${fileNameNFC}`; // ex) user/book/20240425_123456_am_파일명.pdf
  if (removeTime) {
    entireDirectory = `${directory}/${fileNameNFC}`; // ex) user/book/파일명.pdf
  }

  const command = new PutObjectCommand({
    Bucket: "amond-image",
    Key: entireDirectory,
  });

  try {
    // Check if credentials are available before generating URL
    if (!awsAccessKey || !awsSecretKey) {
      console.error("Cannot generate presigned URL: AWS credentials not configured");
      throw new Error("AWS credentials not configured");
    }
    
    // getSignedUrl 함수 호출, expiresIn 옵션으로 URL의 유효 시간 설정
    const url = await getSignedUrl(s3, command, { 
      expiresIn: 60 * 5,
      // Disable checksum headers in presigned URL
      unhoistableHeaders: new Set(["x-amz-checksum-crc32"]),
    });
    
    // Validate the generated URL
    if (!url.includes(awsAccessKey)) {
      console.error("Generated presigned URL appears to be malformed - missing access key");
      throw new Error("Invalid presigned URL generated");
    }
    
    return { url, entireDirectory };
  } catch (error) {
    console.error("Error creating presigned URL:", error);
    console.error("AWS credentials status:", {
      accessKey: awsAccessKey ? "Present" : "Missing",
      secretKey: awsSecretKey ? "Present" : "Missing",
    });
    throw error;
  }
};

const getDownloadUrl = async (key: string, fileName: string) => {
  const command = new GetObjectCommand({
    Bucket: "amond-image",
    Key: key,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(
      fileName
    )}"`,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 60 * 5 });
  return url;
};

const deleteS3 = async (entireUrl: string) => {
  if (entireUrl) {
    try {
      const fileName = entireUrl.replace(
        "https://amond-image.s3.ap-northeast-2.amazonaws.com/",
        ""
      );
      const command = new DeleteObjectCommand({
        Bucket: "amond-image",
        Key: fileName,
      });

      const data = await s3.send(command);
      // console.log("deleteObject", data);
      return true;
    } catch (err) {
      console.log(err, "\nS3 삭제");
      throw err;
      return false;
    }
  }
};

export { s3, uploadPresigned, deleteS3, getDownloadUrl };
