#!/bin/bash

# Quick verification script to check key tables

echo "=== VERIFICATION: Database Synchronization ==="
echo "Date: $(date)"
echo ""

# Tables to check
TABLES=("user" "project" "brand" "membership_tiers" "usage_tracking")

for TABLE in "${TABLES[@]}"; do
    echo "=== TABLE: $TABLE ==="
    
    echo "LOCAL columns:"
    mysql -h 127.0.0.1 -u root -pQkdwkWkd12@@ amond -e "DESCRIBE $TABLE;" 2>&1 | grep -v "Warning" | head -10
    
    echo -e "\nREMOTE columns:"  
    ssh -i amond.pem ec2-user@ec2-52-78-91-203.ap-northeast-2.compute.amazonaws.com \
        "mysql -h localhost -u root -pQkdwkWkd12@@ amond -e 'DESCRIBE $TABLE;'" 2>&1 | grep -v "Warning" | head -10
    
    echo -e "\n---\n"
done