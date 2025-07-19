import { cryptoDeletedKey, cryptoKey, saltRounds } from "./constant";
import connection from "./database";
import bcrypt from "bcrypt";
import CryptoJS from "crypto-js";
import { PoolConnection } from "mysql";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();
import Hashids from "hashids";
const hashids = new Hashids("amond0", 12); // 최소 길이 12, salt: "amond0"으로 해쉬 아이디 생성

/** 쿼리를 Async로 보내는 */
export function queryAsync(sql: string, params: any = []): Promise<any> {
  return new Promise((resolve, reject) => {
    connection.query(sql, params, (err, result) => {
      if (err) return reject(err);
      else return resolve(result);
    });
  });
}

/** 트랜잭션 쿼리를 위한  */
export function queryAsyncConn(
  sql: string,
  params: any = [],
  conn: PoolConnection
): Promise<any> {
  return new Promise((resolve, reject) => {
    conn.query(sql, params, (err, result) => {
      if (err) return reject(err);
      else return resolve(result);
    });
  });
}

/** hash 암호화 */
export const hashPassword = async (password: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    bcrypt.hash(password, saltRounds, (error, hash) => {
      if (error) {
        reject(error);
      } else {
        resolve(hash);
      }
    });
  });
};

/** 같은 결과가 나오는 암호화 (중복 체크 등) */
export const crpytoSameResult = async (input: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const encrypted = CryptoJS.SHA256(input).toString();
      resolve(encrypted);
    } catch (error) {
      reject(error);
    }
  });
};

/** 파일 텍스트 인코딩 */
export function FileTextIncoding(fileName: string) {
  return Buffer.from(fileName, "latin1").toString("utf8");
}

/** 이름 변환 */
export const changeToKorName = (location: string, fileName: string) => {
  const korFileName = FileTextIncoding(fileName);

  let answer;
  if (location.split("am_").length >= 2) {
    answer = `${location.split("am_")[0]}am_${korFileName}`;
  } else if (location.split("pm_").length >= 2) {
    answer = `${location.split("pm_")[0]}pm_${korFileName}`;
  }
  return answer;
};

/** crypto 암호화 */
export const transEncrypt = async (
  input: string,
  deletedKey?: boolean
): Promise<string> => {
  return new Promise((resolve, reject) => {
    let key = cryptoKey;
    if (deletedKey) {
      key = cryptoDeletedKey;
    }
    const encrypted = CryptoJS.AES.encrypt(input, key as string).toString();
    resolve(encrypted);
  });
};

/** crypto 복호화 */
export const transDecrypt = async (
  input: string,
  deletedKey?: boolean
): Promise<string> => {
  return new Promise((resolve, reject) => {
    let key = cryptoKey;
    if (deletedKey) {
      key = cryptoDeletedKey;
    }
    try {
      let decrypted = "";
      if (input) {
        decrypted = CryptoJS.AES.decrypt(input, key as string).toString(
          CryptoJS.enc.Utf8
        );
      }
      resolve(decrypted);
    } catch (e) {
      console.error("복호화 에러");
      resolve(input);
    }
  });
};

/** gmail 발송 */
export const sendGmail = async ({
  to,
  title,
  htmlDescription,
}: {
  to: string;
  title: string;
  htmlDescription: string;
}) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      host: "smtp.gmail.com",
      port: 587,
      secure: true,
      auth: {
        type: "OAuth2",
        user: "service@mond.io.kr",
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
      },
    });

    const mailOptions = {
      to: to,
      subject: title,
      html: htmlDescription,
    };
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.log(error);
    throw error;
  }
};

/** 해쉬 아이디 생성 */
export const createHashId = (id: number) => {
  const hashId = hashids.encode(id);
  return hashId;
};

/** 해쉬 아이디 복호화 */
export const decodeHashId = (hashId: string) => {
  const decodedId = hashids.decode(hashId);
  return decodedId[0];
};

/** 프롬프트 조회 */
export const loadPrompt = async (type: "1차" | "2차" | "이미지", body: any) => {
  // 1. 저장된 프롬프트 조회
  let promptId = 0;
  if (type === "1차") {
    promptId = 1;
  } else if (type === "2차") {
    promptId = 2;
  } else if (type === "이미지") {
    promptId = 3;
  }

  let answer = "";
  const loadPromptSql = `SELECT prompt, required FROM aiPrompt WHERE id = ?;`;
  const loadPromptResult = await queryAsync(loadPromptSql, [promptId]);
  answer = loadPromptResult[0].prompt;
  const required = loadPromptResult[0].required;

  // 2. 프롬프트 템플릿 대체
  if (type === "1차") {
    required.split(",").forEach((item: string) => {
      const key = item.replace("{", "").replace("}", ""); // {name} -> name 괄호 제거
      answer = answer.replace(`{${key}}`, body[key]);
    });
    answer = answer + `\n\n[검색 결과]\n${body.searchResult}`;
  } else if (type === "2차") {
    const contentRequestSql = `SELECT a.*, b.* FROM contentRequest a
    LEFT JOIN project b ON a.fk_projectId = b.id
    WHERE a.id = ?`;
    const contentRequestResult = await queryAsync(contentRequestSql, [
      body.contentRequestId,
    ]);
    required.split(",").forEach((item: string) => {
      if (item !== "{contentSubject}") {
        const key = item.replace("{", "").replace("}", ""); // {name} -> name 괄호 제거
        answer = answer.replace(`{${key}}`, contentRequestResult[0][key]);
      }
    });

    answer =
      answer + `\n\n[검색 결과]\n${contentRequestResult[0].searchResult}`;
  }

  return answer;
};
