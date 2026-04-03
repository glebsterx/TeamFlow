#!/bin/bash
# Backup script for TeamFlow SQLite database
# Usage: ./backup-db.sh [restore <backup_file>]

set -e

BACKUP_DIR="$(cd "$(dirname "$0")" && pwd)/backups"
DB_FILE="backend/data/teamflow.db"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

if [ "$1" = "restore" ]; then
    if [ -z "$2" ]; then
        echo "Usage: $0 restore <backup_file>"
        exit 1
    fi
    
    if [ ! -f "$2" ]; then
        echo "Backup file not found: $2"
        exit 1
    fi
    
    echo "Restoring database from $2..."
    cp "$2" "$DB_FILE"
    echo "Database restored successfully"
    exit 0
fi

# Create backup
BACKUP_FILE="$BACKUP_DIR/teamflow-$TIMESTAMP.db"
cp "$DB_FILE" "$BACKUP_FILE"
echo "Backup created: $BACKUP_FILE"

# Keep only last 10 backups
cd "$BACKUP_DIR"
ls -t teamflow-*.db 2>/dev/null | tail -n +11 | xargs -r rm

echo "Done. Recent backups:"
ls -lh teamflow-*.db 2>/dev/null | tail -5
