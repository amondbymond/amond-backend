# Email Notification Setup Guide

## Local Database Setup

1. **Check your database credentials in `.env` file:**
   ```
   DB_HOST=localhost
   DB_DATABASE=amond
   DB_PASSWORD=your_password
   ```

2. **Run the SQL migration:**

   **Option A: Using MySQL command line**
   ```bash
   mysql -u root -p amond < add_email_notification_table.sql
   ```
   Enter your password when prompted.

   **Option B: Using MySQL client (like MySQL Workbench, phpMyAdmin, etc.)**
   - Connect to your database
   - Select the 'amond' database
   - Copy and run the contents of `add_email_notification_table.sql`

   **Option C: Quick command if no password:**
   ```bash
   mysql -u root amond < add_email_notification_table.sql
   ```

3. **Verify the table was created:**
   ```bash
   mysql -u root -p amond -e "SHOW TABLES LIKE 'emailNotification';"
   ```

## Production Database Setup

After testing locally, run the same SQL script on your production database:

1. **IMPORTANT: Remove the DROP TABLE line from the SQL file for production**
   - Edit `add_email_notification_table.sql` 
   - Remove or comment out the line: `DROP TABLE IF EXISTS emailNotification;`

2. **Run on production:**
   ```bash
   mysql -h your_production_host -u your_production_user -p your_production_db < add_email_notification_table.sql
   ```

## Troubleshooting

If you get case sensitivity errors:
- MySQL on Linux is case-sensitive for table names
- MySQL on macOS/Windows is usually case-insensitive
- The table name in code must match exactly what's in the database

## Features

Once set up, the email notification system will:
1. Store email notification requests when users click "이메일 알림 받기"
2. Send emails automatically when all images are generated
3. Work even if users close their browser tabs
4. Handle retries for failed image generations