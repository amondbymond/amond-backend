const mysql = require('mysql');
require('dotenv').config();

function runMigration() {
  // Create connection
  const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    charset: 'utf8mb4',
    timezone: 'Asia/Seoul'
  });

  connection.connect((err) => {
    if (err) {
      console.error('Error connecting to database:', err);
      return;
    }
    console.log('Connected to database');

    // Add direction field to content table
    connection.query(`
      ALTER TABLE content ADD COLUMN IF NOT EXISTS direction VARCHAR(50) DEFAULT '정보형'
    `, (err, result) => {
      if (err) {
        console.error('Error adding direction field:', err);
      } else {
        console.log('✓ Added direction field to content table');
      }

      // Update existing content items to have a default direction
      connection.query(`
        UPDATE content SET direction = '정보형' WHERE direction IS NULL
      `, (err, result) => {
        if (err) {
          console.error('Error updating existing content:', err);
        } else {
          console.log(`✓ Updated ${result.affectedRows} existing content items with default direction`);
        }

        console.log('Migration completed successfully!');
        connection.end();
      });
    });
  });
}

runMigration(); 