const mysql = require('mysql');
require('dotenv').config();

function fixImageLogColumn() {
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

    // Fix imageLog column size
    connection.query(`
      ALTER TABLE content MODIFY COLUMN imageLog TEXT
    `, (err, result) => {
      if (err) {
        console.error('Error fixing imageLog column:', err);
      } else {
        console.log('✓ Fixed imageLog column size to TEXT');
      }

      // Clear existing truncated data
      connection.query(`
        UPDATE content SET imageLog = NULL WHERE imageLog IS NOT NULL
      `, (err, result) => {
        if (err) {
          console.error('Error clearing existing imageLog data:', err);
        } else {
          console.log(`✓ Cleared ${result.affectedRows} existing imageLog entries`);
        }

        console.log('ImageLog column fix completed successfully!');
        connection.end();
      });
    });
  });
}

// Run the migration
fixImageLogColumn(); 