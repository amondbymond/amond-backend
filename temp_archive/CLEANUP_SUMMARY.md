# Cleanup Summary - 2025-08-10

## Files Moved to temp_archive

### Scripts Moved (from parent directory ../):
- check_production_db_with_auth.sh
- check_production_db.sh  
- deploy_both_quick.sh
- fix_aws_credentials.sh
- start_all_with_logs.sh
- verify_migration.sh

### Scripts Kept (in parent directory ../):
- start_all.sh
- deploy_both.sh

### SQL Files Moved:
- All old migration files (add_*.sql, fix_*.sql, ec2_*.sql)
- Schema comparison files (local_schema.sql, production_schemas.sql, etc.)
- Temporary and backup SQL files
- All files from scripts/ folder

### SQL Files Kept (in sql/ folder):
- pricing_system.sql
- remote_migration_safe.sql
- update_pricing_system_safe.sql
- update_pricing_system.sql

### Documentation Moved:
- AWS_SES_SETUP.md
- IMPORTANT_EMAIL_DECISION.md
- PROFESSIONAL_EMAIL_SETUP.md
- README_EMAIL_NOTIFICATION_SETUP.md
- config/limits.md
- local_tables.txt
- requirements.txt
- All markdown files from scripts/ folder

### Documentation Kept:
- README.md (main project readme)

### Other Files Moved:
- All log files from logs/ folder
- fix_imagelog_migration.js (old migration script)
- .env.example.sendgrid (example config file)

## Empty Directories Removed:
- scripts/
- logs/

## To Restore Files:
If you need any of these files back, they are all in the temp_archive folder with the following structure:
- temp_archive/scripts/ - Shell scripts
- temp_archive/sql/ - SQL files
- temp_archive/docs/ - Documentation
- temp_archive/logs/ - Log files

## To Permanently Delete:
When you're sure you don't need these files anymore, you can delete the entire temp_archive folder:
```bash
rm -rf temp_archive ../temp_archive
```