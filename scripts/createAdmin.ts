import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { queryAsync, transEncrypt, crpytoSameResult } from "../module/commonFunction";
import { saltRounds } from "../module/constant";

dotenv.config();

async function createAdminAccount() {
  // Admin credentials - CHANGE THESE!
  const adminEmail = "admin@amond.io.kr";
  const adminPassword = "admin123!@#";
  const adminName = "관리자";

  try {
    console.log("Creating admin account...");
    
    // Check if admin already exists
    const emailDuplicate = await crpytoSameResult(adminEmail);
    const existingAdmin = await queryAsync(
      `SELECT id, grade FROM user WHERE emailDuplicate = ?`,
      [emailDuplicate]
    );

    if (existingAdmin.length > 0) {
      // If user exists but is not admin, update to admin
      if (existingAdmin[0].grade !== 'A') {
        await queryAsync(
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
    const encryptedEmail = await transEncrypt(adminEmail);
    const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);

    const sql = `INSERT INTO user(authType, email, password, emailDuplicate, name, grade, createdAt, lastLoginAt)
      VALUES("이메일", ?, ?, ?, ?, "A", NOW(), NOW());`;

    const result = await queryAsync(sql, [
      encryptedEmail,
      hashedPassword,
      emailDuplicate,
      adminName,
    ]);

    console.log(`✓ Admin account created successfully!`);
    console.log(`  Email: ${adminEmail}`);
    console.log(`  Password: ${adminPassword}`);
    console.log(`  User ID: ${result.insertId}`);
    console.log(`\n⚠️  IMPORTANT: Please change the password after first login!`);
    
  } catch (error) {
    console.error("Error creating admin account:", error);
  } finally {
    process.exit();
  }
}

// Run the script
createAdminAccount();