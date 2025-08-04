const mysql = require('mysql2');
require('dotenv').config({ path: __dirname + '/../.env' });

const connection = mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'amond',
  timezone: 'Asia/Seoul'
});

function queryPromise(sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.query(sql, params, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
}

async function checkDatabaseSchema() {
  try {
    console.log('=== LOCAL DATABASE SCHEMA CHECK ===\n');

    // 1. Check all tables
    console.log('1. EXISTING TABLES:');
    const tables = await queryPromise(`
      SELECT TABLE_NAME, TABLE_ROWS, CREATE_TIME, UPDATE_TIME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME
    `);
    
    for (const table of tables) {
      console.log(`- ${table.TABLE_NAME} (Rows: ${table.TABLE_ROWS})`);
    }

    // 2. Check user table structure
    console.log('\n2. USER TABLE STRUCTURE:');
    const userColumns = await queryPromise(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user'
      ORDER BY ORDINAL_POSITION
    `);
    
    console.log('Columns:');
    for (const col of userColumns) {
      console.log(`- ${col.COLUMN_NAME}: ${col.DATA_TYPE} ${col.IS_NULLABLE === 'NO' ? 'NOT NULL' : 'NULL'} ${col.EXTRA}`);
    }

    // 3. Check for important columns
    console.log('\n3. CHECKING FOR IMPORTANT COLUMNS IN USER TABLE:');
    const importantColumns = [
      'name',
      'sessionToken',
      'tokenUpdatedAt',
      'membershipStartDate',
      'membershipEndDate',
      'membershipStatus'
    ];

    for (const colName of importantColumns) {
      const exists = await queryPromise(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'user' 
        AND COLUMN_NAME = ?
      `, [colName]);
      
      if (exists.length === 0) {
        console.log(`❌ Missing: ${colName}`);
      } else {
        console.log(`✅ Exists: ${colName}`);
      }
    }

    // 4. Check for missing tables
    console.log('\n4. CHECKING FOR REQUIRED TABLES:');
    const requiredTables = [
      'brand',
      'project',
      'contentRequest',
      'content',
      'membership_tiers',
      'payment_subscriptions',
      'billing_keys',
      'payment_logs',
      'emailNotification'
    ];

    for (const tableName of requiredTables) {
      const exists = await queryPromise(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = ?
      `, [tableName]);
      
      if (exists.length === 0) {
        console.log(`❌ Missing: ${tableName}`);
      } else {
        console.log(`✅ Exists: ${tableName}`);
      }
    }

    // 5. Check sample user data
    console.log('\n5. SAMPLE USER DATA:');
    const users = await queryPromise(`
      SELECT id, authType, grade, lastLoginAt, createdAt
      FROM user
      LIMIT 5
    `);
    
    console.log(`Total users in database: ${tables.find(t => t.TABLE_NAME === 'user')?.TABLE_ROWS || 0}`);
    console.log('Sample users:');
    for (const user of users) {
      console.log(`- User ${user.id}: ${user.authType}, Grade: ${user.grade}, Created: ${user.createdAt}`);
    }

    // 6. Check content and project tables
    console.log('\n6. CONTENT AND PROJECT TABLES:');
    const projects = await queryPromise(`SELECT COUNT(*) as count FROM project`);
    const contents = await queryPromise(`SELECT COUNT(*) as count FROM content`);
    const contentRequests = await queryPromise(`SELECT COUNT(*) as count FROM contentRequest`);
    
    console.log(`- Projects: ${projects[0].count}`);
    console.log(`- Content Requests: ${contentRequests[0].count}`);
    console.log(`- Contents: ${contents[0].count}`);

  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    connection.end();
  }
}

// Run the check
checkDatabaseSchema().catch(console.error);