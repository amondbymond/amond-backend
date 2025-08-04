const mysql = require('mysql');
require('dotenv').config({ path: '../.env' });

const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: 'QkdwkWkd12@@',
  database: 'amond',
  charset: 'utf8mb4',
});

function queryAsync(sql, values) {
  return new Promise((resolve, reject) => {
    pool.query(sql, values, (error, results) => {
      if (error) return reject(error);
      resolve(results);
    });
  });
}

async function cleanUser27() {
  console.log('Starting cleanup for user 27...');
  
  try {
    // Disable foreign key checks
    await queryAsync('SET FOREIGN_KEY_CHECKS = 0');
    
    // Get project count before deletion
    const projectsBefore = await queryAsync('SELECT COUNT(*) as count FROM project WHERE fk_userId = 27');
    console.log(`Projects before deletion: ${projectsBefore[0].count}`);
    
    // Delete content
    const contentResult = await queryAsync(`
      DELETE c FROM content c
      JOIN contentrequest cr ON c.fk_contentRequestId = cr.id
      JOIN project p ON cr.fk_projectId = p.id
      WHERE p.fk_userId = 27
    `);
    console.log(`Content deleted: ${contentResult.affectedRows}`);
    
    // Delete content requests
    const crResult = await queryAsync(`
      DELETE cr FROM contentrequest cr
      JOIN project p ON cr.fk_projectId = p.id
      WHERE p.fk_userId = 27
    `);
    console.log(`Content requests deleted: ${crResult.affectedRows}`);
    
    // Delete regenerate logs
    const rlResult = await queryAsync(`
      DELETE rl FROM regeneratelog rl
      JOIN project p ON rl.fk_projectId = p.id
      WHERE p.fk_userId = 27
    `);
    console.log(`Regenerate logs deleted: ${rlResult.affectedRows}`);
    
    // Delete projects
    const projectResult = await queryAsync('DELETE FROM project WHERE fk_userId = 27');
    console.log(`Projects deleted: ${projectResult.affectedRows}`);
    
    // Delete brands
    const brandResult = await queryAsync('DELETE FROM brand WHERE fk_userId = 27');
    console.log(`Brands deleted: ${brandResult.affectedRows}`);
    
    // Re-enable foreign key checks
    await queryAsync('SET FOREIGN_KEY_CHECKS = 1');
    
    // Verify cleanup
    const projectsAfter = await queryAsync('SELECT COUNT(*) as count FROM project WHERE fk_userId = 27');
    const brandsAfter = await queryAsync('SELECT COUNT(*) as count FROM brand WHERE fk_userId = 27');
    
    console.log('\nCleanup complete!');
    console.log(`Remaining projects for user 27: ${projectsAfter[0].count}`);
    console.log(`Remaining brands for user 27: ${brandsAfter[0].count}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanUser27();