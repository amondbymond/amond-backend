const mysql = require('mysql2/promise');

async function checkTables() {
  // Local connection
  const localConn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'QkdwkWkd12@@',
    database: 'amond'
  });

  // Production connection
  const prodConn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'QkdwkWkd12@@',
    database: 'amond'
  });

  try {
    // Get local tables
    const [localTables] = await localConn.query('SHOW TABLES');
    const localTableNames = localTables.map(row => Object.values(row)[0]).sort();
    
    console.log('Local tables:', localTableNames);
    
    // Get production tables - you'll need to run this on EC2
    console.log('\nTo check production tables, run this on EC2:');
    console.log('mysql -u root -pQkdwkWkd12@@ amond -e "SHOW TABLES;"');
    
    // Check specific tables that might be missing
    const criticalTables = ['contentrequest', 'feedset', 'brand', 'content'];
    console.log('\nCritical tables to check:');
    criticalTables.forEach(table => {
      console.log(`- ${table}: ${localTableNames.includes(table) ? 'EXISTS' : 'MISSING'} in local`);
    });
    
  } finally {
    await localConn.end();
    await prodConn.end();
  }
}

checkTables().catch(console.error);