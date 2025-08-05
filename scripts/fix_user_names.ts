// Script to fix user names in production
// Run this to update users who have generic names like "사용자_41"

import { queryAsync, transDecrypt } from "../module/commonFunction";

async function fixUserNames() {
  try {
    // Get all users with generic names
    const users = await queryAsync(
      `SELECT id, email, authType, name 
       FROM user 
       WHERE name LIKE '사용자_%' OR name IS NULL`,
      []
    );

    console.log(`Found ${users.length} users to update`);

    for (const user of users) {
      let newName = '';

      if (user.email) {
        try {
          // Decrypt email to get the real email
          const decryptedEmail = await transDecrypt(user.email);
          // Extract username from email
          newName = decryptedEmail.split('@')[0];
        } catch (e) {
          console.error(`Failed to decrypt email for user ${user.id}`);
          // Fall back to authType-based name
          if (user.authType === '구글') {
            newName = '구글 사용자';
          } else if (user.authType === '카카오') {
            newName = '카카오 사용자';
          } else {
            newName = `${user.authType} 사용자`;
          }
        }
      } else {
        // No email, use authType
        if (user.authType === '구글') {
          newName = '구글 사용자';
        } else if (user.authType === '카카오') {
          newName = '카카오 사용자';
        } else {
          newName = `${user.authType} 사용자`;
        }
      }

      // Update the user's name
      await queryAsync(
        `UPDATE user SET name = ? WHERE id = ?`,
        [newName, user.id]
      );

      console.log(`Updated user ${user.id}: ${user.name} -> ${newName}`);
    }

    console.log('User names update completed!');
  } catch (error) {
    console.error('Error updating user names:', error);
  }
}

// Run the fix
fixUserNames();