#!/bin/bash
set -e

# Ensure a minimum delay before any non-zero exit so Docker's restart policy
# never produces a tight CPU-spinning loop regardless of what fails at startup.
on_exit() {
    local code=$?
    if [ "$code" -ne 0 ]; then
        echo "Startup error (exit code $code) — sleeping 5s before allowing Docker restart..."
        sleep 5
    fi
}
trap on_exit EXIT

python manage.py wait_for_db
# Wait for migrations
python manage.py wait_for_migrations
# Run the processes
celery -A plane worker -l info
