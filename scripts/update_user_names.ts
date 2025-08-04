import dotenv from "dotenv";
import { queryAsync, transDecrypt } from "../module/commonFunction";

dotenv.config();

async function updateUserNames() {
  try {
    console.log("Checking if name column exists...");
    
    // Check if name column exists
    const columnCheckSql = `
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'user' 
      AND COLUMN_NAME = 'name'
      AND TABLE_SCHEMA = DATABASE()
    `;
    
    const columnExists = await queryAsync(columnCheckSql, []);
    
    if (columnExists.length === 0) {
      console.log("Name column doesn't exist. Adding it now...");
      
      // Add name column
      await queryAsync(`ALTER TABLE user ADD COLUMN name VARCHAR(100) DEFAULT NULL AFTER authType`, []);
      console.log("Name column added successfully!");
    } else {
      console.log("Name column already exists.");
    }
    
    // Update existing users with names
    console.log("Updating user names...");
    
    // First, update social login users
    await queryAsync(`
      UPDATE user 
      SET name = CASE 
          WHEN authType = '카카오' THEN '카카오 사용자'
          WHEN authType = '구글' THEN '구글 사용자'
          ELSE CONCAT('이메일 사용자', id)
      END
      WHERE name IS NULL OR name = ''
    `, []);
    
    console.log("Social login users updated.");
    
    // Now update email users
    const emailUsers = await queryAsync(`
      SELECT id, email 
      FROM user 
      WHERE authType = '이메일' 
      AND (name IS NULL OR name = '')
      AND email IS NOT NULL
    `, []);
    
    console.log(`Found ${emailUsers.length} email users to update.`);
    
    for (const user of emailUsers) {
      try {
        const decryptedEmail = await transDecrypt(user.email);
        const username = decryptedEmail.split('@')[0];
        
        await queryAsync(`UPDATE user SET name = ? WHERE id = ?`, [username, user.id]);
        console.log(`Updated user ${user.id} with name: ${username}`);
      } catch (error) {
        console.error(`Failed to update user ${user.id}:`, error);
        // Fallback name
        await queryAsync(`UPDATE user SET name = ? WHERE id = ?`, [`user_${user.id}`, user.id]);
      }
    }
    
    console.log("User name update completed!");
    
    // Show sample data
    const sampleUsers = await queryAsync(`
      SELECT id, authType, name, email 
      FROM user 
      LIMIT 10
    `, []);
    
    console.log("\nSample users after update:");
    for (const user of sampleUsers) {
      console.log(`ID: ${user.id}, Type: ${user.authType}, Name: ${user.name}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error("Error updating user names:", error);
    process.exit(1);
  }
}

updateUserNames();