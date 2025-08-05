const mysql = require('mysql2/promise');
const fs = require('fs');

async function compareSchemas() {
  const localConn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'QkdwkWkd12@@',
    database: 'amond'
  });

  try {
    // Get all tables
    const [tables] = await localConn.query('SHOW TABLES');
    const tableNames = tables.map(row => Object.values(row)[0]);
    
    console.log('Tables to check:', tableNames);
    
    // Check each table structure
    const schemas = {};
    for (const table of tableNames) {
      const [createTable] = await localConn.query(`SHOW CREATE TABLE ${table}`);
      schemas[table] = createTable[0]['Create Table'];
    }
    
    // Write to file for comparison
    fs.writeFileSync('local_schemas.sql', Object.entries(schemas).map(([table, schema]) => 
      `-- Table: ${table}\n${schema};\n\n`
    ).join(''));
    
    console.log('Local schemas written to local_schemas.sql');
    console.log('\nNow run this on EC2 to get production schemas:');
    console.log('mysql -u root -pQkdwkWkd12@@ amond -e "SHOW TABLES;" | tail -n +2 | while read table; do echo "-- Table: $table"; mysql -u root -pQkdwkWkd12@@ amond -e "SHOW CREATE TABLE $table\\G" | grep -v "\\*\\*\\*" | sed "s/Create Table: //"; echo ";"; echo ""; done > production_schemas.sql');
    
  } finally {
    await localConn.end();
  }
}

compareSchemas().catch(console.error);