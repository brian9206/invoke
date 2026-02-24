---
sidebar_position: 8
---

# Logs and Monitoring

View and analyze function execution logs using the Invoke CLI.

## Viewing Logs

### Basic Log Viewing

View recent logs for a function:

```bash
invoke function:logs my-api
```

**Example output:**
```
📋 Execution Logs:

┌───────────────────────┬────────┬──────────┬───────┐
│ Time                  │ Status │ Duration │ Error │
├───────────────────────┼────────┼──────────┼───────┤
│ 23/2/2026, 2:10:57 pm │ ✅ 200 │ 31ms     │ -     │
│ 23/2/2026, 2:08:00 pm │ ✅ 200 │ 30ms     │ -     │
│ 23/2/2026, 2:07:51 pm │ ❌ 500 │ 125ms    │ Type  │
│ 23/2/2026, 2:02:37 pm │ ✅ 200 │ 39ms     │ -     │
└───────────────────────┴────────┴──────────┴───────┘

Page 1 of 3 (150 total)
```

## Filtering Logs

### By Status

View only successful executions:

```bash
invoke function:logs my-api --status success
```

View only errors:

```bash
invoke function:logs my-api --status error
```

View all (default):

```bash
invoke function:logs my-api --status all
```

### Limit Results

Limit the number of logs returned:

```bash
# Get last 10 logs
invoke function:logs my-api --limit 10

# Get last 100 logs
invoke function:logs my-api --limit 100
```

**Default limit:** 50

### Pagination

Navigate through pages of logs:

```bash
# First page (default)
invoke function:logs my-api --page 1

# Second page
invoke function:logs my-api --page 2

# Third page
invoke function:logs my-api --page 3
```

## JSON Output

Get structured log data:

```bash
invoke function:logs my-api --output json
```

**Example JSON output:**
```json
{
  "logs": [
    {
      "id": "log_abc123",
      "function_id": "cd23cc1f-936f-445e-b2ba-dd8306b8dc01",
      "status_code": 200,
      "execution_time_ms": 31,
      "error_message": null,
      "executed_at": "2026-02-23T14:10:57.000Z"
    },
    {
      "id": "log_def456",
      "function_id": "cd23cc1f-936f-445e-b2ba-dd8306b8dc01",
      "status_code": 500,
      "execution_time_ms": 125,
      "error_message": "TypeError: Cannot read property 'name' of undefined",
      "executed_at": "2026-02-23T14:07:51.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalCount": 150,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

## Monitoring Examples

### Real-time Monitoring

Watch logs in real-time with a shell loop:

```bash
#!/bin/bash

while true; do
  clear
  echo "=== Function Logs (Last 10) ==="
  invoke function:logs my-api --limit 10
  sleep 5
done
```

### Error Tracking

Find and analyze errors:

```bash
# Get error logs only
invoke function:logs my-api --status error --limit 20
```

**Save errors to file:**
```bash
invoke function:logs my-api --status error --output json > errors.json
```

### Performance Analysis

Analyze execution times:

```bash
#!/bin/bash

# Get logs as JSON
logs=$(invoke function:logs my-api --limit 100 --output json)

# Calculate average execution time
avg=$(echo $logs | jq '[.logs[].execution_time_ms] | add / length')

echo "Average execution time: ${avg}ms"

# Find slowest executions
echo "Slowest executions:"
echo $logs | jq '.logs | sort_by(.execution_time_ms) | reverse | .[0:5]'
```

### Success Rate

Calculate success rate:

```bash
#!/bin/bash

# Get all logs
all_logs=$(invoke function:logs my-api --limit 100 --output json)

# Count successes and errors
total=$(echo $all_logs | jq '.logs | length')
successes=$(echo $all_logs | jq '[.logs[] | select(.status_code >= 200 and .status_code < 300)] | length')

success_rate=$(echo "scale=2; $successes * 100 / $total" | bc)

echo "Success rate: ${success_rate}%"
echo "Successes: $successes / $total"
```

## Log Retention

### Setting Retention Policy

Configure how long logs are retained:

**Time-based retention:**
```bash
# Keep logs for 7 days
invoke function:retention:set my-api --type time --days 7

# Keep logs for 30 days
invoke function:retention:set my-api --type time --days 30
```

**Count-based retention:**
```bash
# Keep last 1000 logs
invoke function:retention:set my-api --type count --count 1000

# Keep last 10000 logs
invoke function:retention:set my-api --type count --count 10000
```

**No retention (keep all logs):**
```bash
invoke function:retention:set my-api --type none
```

### Viewing Retention Settings

Check current retention policy:

```bash
invoke function:get my-api | grep -i retention
```

## Scheduling and Logs

### Setting Up Scheduled Execution

Schedule a function to run periodically:

```bash
# Run every minute
invoke function:schedule:set my-api --cron "* * * * *"

# Run every hour
invoke function:schedule:set my-api --cron "0 * * * *"

# Run daily at midnight
invoke function:schedule:set my-api --cron "0 0 * * *"

# Run every Monday at 9 AM
invoke function:schedule:set my-api --cron "0 9 * * 1"
```

### Disable Scheduled Execution

```bash
invoke function:schedule:disable my-api
```

### Monitoring Scheduled Executions

View logs from scheduled runs:

```bash
# View recent executions
invoke function:logs my-api --limit 50

# Check for failures in scheduled runs
invoke function:logs my-api --status error
```

## Complete Monitoring Workflow

### Daily Health Check Script

```bash
#!/bin/bash

FUNCTION="my-api"
DATE=$(date '+%Y-%m-%d')

echo "=== Function Health Report: $DATE ==="
echo ""

# Get logs from last 24 hours
logs=$(invoke function:logs $FUNCTION --limit 1000 --output json)

# Total executions
total=$(echo $logs | jq '.logs | length')
echo "Total executions: $total"

# Success/Error counts
successes=$(echo $logs | jq '[.logs[] | select(.status_code >= 200 and .status_code < 300)] | length')
errors=$(echo $logs | jq '[.logs[] | select(.status_code >= 400)] | length')

echo "Successes: $successes"
echo "Errors: $errors"

# Success rate
if [ $total -gt 0 ]; then
  success_rate=$(echo "scale=2; $successes * 100 / $total" | bc)
  echo "Success rate: ${success_rate}%"
fi

# Average execution time
avg_time=$(echo $logs | jq '[.logs[].execution_time_ms] | add / length')
echo "Average execution time: ${avg_time}ms"

# Recent errors
if [ $errors -gt 0 ]; then
  echo ""
  echo "=== Recent Errors ==="
  invoke function:logs $FUNCTION --status error --limit 5
fi
```

### Alert on Errors

```bash
#!/bin/bash

FUNCTION="my-api"
ERROR_THRESHOLD=5

# Get recent errors
errors=$(invoke function:logs $FUNCTION \
  --status error \
  --limit 10 \
  --output json | jq '.logs | length')

if [ $errors -ge $ERROR_THRESHOLD ]; then
  echo "⚠️  ALERT: $errors errors detected in $FUNCTION"
  
  # Send notification (example: email, Slack, etc.)
  # curl -X POST https://hooks.slack.com/... \
  #   -d "{\"text\": \"Function $FUNCTION has $errors errors\"}"
  
  exit 1
fi

echo "✅ Function is healthy ($errors errors)"
```

### Performance Degradation Detection

```bash
#!/bin/bash

FUNCTION="my-api"
THRESHOLD_MS=1000  # Alert if average exceeds 1 second

# Get recent logs
logs=$(invoke function:logs $FUNCTION --limit 50 --output json)

# Calculate average execution time
avg=$(echo $logs | jq '[.logs[].execution_time_ms] | add / length')

# Check threshold
if (( $(echo "$avg > $THRESHOLD_MS" | bc -l) )); then
  echo "⚠️  Performance issue: Average execution time is ${avg}ms"
  exit 1
fi

echo "✅ Performance is good: ${avg}ms average"
```

## Tips

### Combine Filters

Get recent errors with pagination:

```bash
invoke function:logs my-api --status error --limit 20 --page 1
```

### Export for Analysis

Export logs for external analysis:

```bash
# Export to JSON file
invoke function:logs my-api --limit 1000 --output json > logs-export.json

# Import to spreadsheet or analysis tool
```

### Quick Error Check

```bash
# Check if any errors in last 50 executions
invoke function:logs my-api --status error --limit 50 | grep "❌"
```

### Watch Specific Status Codes

```bash
# Filter for specific status code using jq
invoke function:logs my-api --output json | \
  jq '.logs[] | select(.status_code == 404)'
```

### Time-based Analysis

```bash
# Get logs as JSON and filter by time
invoke function:logs my-api --limit 1000 --output json | \
  jq '.logs[] | select(.executed_at > "2026-02-23T12:00:00Z")'
```

## Troubleshooting

### No Logs Appearing

1. Check if function has been executed:
   ```bash
   invoke function:get my-api | grep "Total Executions"
   ```

2. Verify function is active:
   ```bash
   invoke function:get my-api | grep "Active"
   ```

3. Try executing the function:
   ```bash
   invoke function:test my-api
   ```

### Missing Error Details

Error messages are truncated in table view. Use JSON output:

```bash
invoke function:logs my-api --status error --output json
```

### Pagination Confusion

Check the pagination info at the bottom of the output to see total pages and current position.
