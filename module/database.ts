import mysql from "mysql";
import dotenv from "dotenv";
dotenv.config();

const connection = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: "root",
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  charset: "utf8mb4",
  timezone: "Asia/Seoul", // ✅ MySQL 커넥션에서 KST 적용
});

export default connection;
