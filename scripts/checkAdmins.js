const dotenv = require("dotenv");
const mysql = require("mysql2/promise");
const CryptoJS = require("crypto-js");
const crypto = require("crypto");

dotenv.config();

const cryptoKey = process.env.CRYPTO_KEY || "amond123@@A";

function transDecrypt(data) {
  try {
    const decrypted = CryptoJS.AES.decrypt(data, cryptoKey).toString(CryptoJS.enc.Utf8);
    return decrypted;
  } catch (e) {
    console.error("Decryption error");
    return data;
  }
}

async function checkAdmins() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "amond",
    port: process.env.DB_PORT || 3306,
  });

  try {
    // Get all admin accounts
    const [admins] = await connection.execute(
      `SELECT id, authType, email, name, grade, createdAt FROM user WHERE grade = 'A'`
    );

    console.log("\n=== Current Admin Accounts ===");
    for (const admin of admins) {
      let displayEmail = "N/A";
      if (admin.authType === "이메일" && admin.email) {
        displayEmail = transDecrypt(admin.email);
      }
      console.log(`\nID: ${admin.id}`);
      console.log(`Name: ${admin.name || "N/A"}`);
      console.log(`Email: ${displayEmail}`);
      console.log(`Auth Type: ${admin.authType}`);
      console.log(`Created: ${admin.createdAt}`);
    }
    
    // Check if our target admin exists
    const targetEmailHash = crypto.createHash("sha256").update("admin@mond.io.kr").digest("hex");
    const [targetAdmin] = await connection.execute(
      `SELECT id FROM user WHERE emailDuplicate = ?`,
      [targetEmailHash]
    );
    
    if (targetAdmin.length > 0) {
      console.log(`\n✓ Account with email admin@mond.io.kr exists (ID: ${targetAdmin[0].id})`);
    } else {
      console.log("\n✗ Account with email admin@mond.io.kr does not exist");
    }
    
  } catch (error) {
    console.error("Error checking admins:", error);
  } finally {
    await connection.end();
  }
}

checkAdmins();