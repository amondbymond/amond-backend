#!/bin/bash

# Database connection details
LOCAL_DB="mysql -h 127.0.0.1 -u root -pQkdwkWkd12@@ amond"
REMOTE_CMD="ssh -i amond.pem -o StrictHostKeyChecking=no ec2-user@ec2-52-78-91-203.ap-northeast-2.compute.amazonaws.com"
REMOTE_DB="mysql -h localhost -u root -pQkdwkWkd12@@ amond"

echo "========================================"
echo "Database Structure Comparison Report"
echo "Generated on: $(date)"
echo "========================================"
echo ""

# Get list of all tables
TABLES=$($LOCAL_DB -N -e "SHOW TABLES;" 2>/dev/null | grep -v "Warning")

for TABLE in $TABLES; do
    echo "================================================"
    echo "TABLE: $TABLE"
    echo "================================================"
    
    # Get local structure
    echo -e "\n--- LOCAL STRUCTURE ---"
    $LOCAL_DB -e "SHOW CREATE TABLE $TABLE\G" 2>/dev/null | grep -v "Warning" | sed 's/Create Table://' > /tmp/local_${TABLE}.sql
    
    # Get remote structure
    echo -e "\n--- REMOTE STRUCTURE ---"
    $REMOTE_CMD "$REMOTE_DB -e 'SHOW CREATE TABLE $TABLE\G'" 2>/dev/null | grep -v "Warning" | sed 's/Create Table://' > /tmp/remote_${TABLE}.sql
    
    # Compare structures
    echo -e "\n--- DIFFERENCES ---"
    if diff -u /tmp/local_${TABLE}.sql /tmp/remote_${TABLE}.sql > /tmp/diff_${TABLE}.txt 2>&1; then
        echo "No differences found"
    else
        cat /tmp/diff_${TABLE}.txt | grep -E "^[\+\-]" | grep -v "^[\+\-][\+\-][\+\-]" | head -50
    fi
    
    # Show column details
    echo -e "\n--- COLUMN COMPARISON ---"
    echo "LOCAL:"
    $LOCAL_DB -e "DESCRIBE $TABLE;" 2>/dev/null | grep -v "Warning"
    echo -e "\nREMOTE:"
    $REMOTE_CMD "$REMOTE_DB -e 'DESCRIBE $TABLE;'" 2>/dev/null | grep -v "Warning"
    
    echo -e "\n"
done

# Clean up temp files
rm -f /tmp/local_*.sql /tmp/remote_*.sql /tmp/diff_*.txt