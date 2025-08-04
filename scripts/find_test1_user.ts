import { queryAsync, transDecrypt } from "../module/commonFunction";
import dotenv from "dotenv";

dotenv.config();

async function findTest1User() {
  try {
    const users = await queryAsync('SELECT id, email, name, authType FROM user WHERE authType = "이메일"', []);
    
    console.log("Searching for test1 user...");
    
    for (const user of users) {
      if (user.email) {
        try {
          const decrypted = await transDecrypt(user.email);
          if (decrypted.includes('test1')) {
            console.log('Found test1 user:', { 
              id: user.id, 
              email: decrypted, 
              name: user.name,
              authType: user.authType 
            });
          }
        } catch (e) {
          // Skip decryption errors
        }
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findTest1User();