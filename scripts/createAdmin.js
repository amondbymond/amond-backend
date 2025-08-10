const bcrypt = require("bcrypt");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");
const CryptoJS = require("crypto-js");

dotenv.config();

// Import encryption functions
const crypto = require("crypto");

// Encryption functions (matching backend implementation)
const cryptoKey = process.env.CRYPTO_KEY || "amond123@@A";

function transEncrypt(data) {
  return CryptoJS.AES.encrypt(data, cryptoKey).toString();
}

function crpytoSameResult(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function createAdminAccount() {
  // Admin credentials
  const adminEmail = "admin@mond.io.kr";
  const adminPassword = "dkahsem123@";
  const adminName = "관리자";
  const saltRounds = 10;

  // Create database connection
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "amond",
    port: process.env.DB_PORT || 3306,
  });

  try {
    console.log("Creating admin account...");
    
    // Check if admin already exists
    const emailDuplicate = crpytoSameResult(adminEmail);
    const [existingAdmin] = await connection.execute(
      `SELECT id, grade FROM user WHERE emailDuplicate = ?`,
      [emailDuplicate]
    );

    if (existingAdmin.length > 0) {
      // If user exists but is not admin, update to admin
      if (existingAdmin[0].grade !== 'A') {
        await connection.execute(
          `UPDATE user SET grade = 'A' WHERE id = ?`,
          [existingAdmin[0].id]
        );
        console.log(`✓ Existing user (ID: ${existingAdmin[0].id}) has been promoted to admin`);
      } else {
        console.log(`✓ Admin account already exists (ID: ${existingAdmin[0].id})`);
      }
      return;
    }

    // Create new admin account
    const encryptedEmail = transEncrypt(adminEmail);
    const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);

    const sql = `INSERT INTO user(authType, email, password, emailDuplicate, name, grade, createdAt, lastLoginAt)
      VALUES("이메일", ?, ?, ?, ?, "A", NOW(), NOW());`;

    const [result] = await connection.execute(sql, [
      encryptedEmail,
      hashedPassword,
      emailDuplicate,
      adminName,
    ]);

    console.log(`\n✓ Admin account created successfully!`);
    console.log(`  Email: ${adminEmail}`);
    console.log(`  Password: ${adminPassword}`);
    console.log(`  User ID: ${result.insertId}`);
    console.log(`\n⚠️  IMPORTANT: Please change the password after first login!`);
    console.log(`\n📍 Access admin panel at: http://localhost:3000/admin`);
    
  } catch (error) {
    console.error("Error creating admin account:", error);
  } finally {
    await connection.end();
    process.exit();
  }
}

// Run the script
createAdminAccount();