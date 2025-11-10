# Deployment Guide - FortLoot Backend

## Persistent Volumes Configuration (Coolify/Docker)

### Required Volumes

The backend requires two persistent volumes to maintain data across container restarts:

1. **`/app/logs`** - Application logs (Winston daily rotate files)
2. **`/app/uploads`** - Payment proof images

### Coolify Configuration

#### Option 1: Using Coolify UI

1. Go to your application settings in Coolify
2. Navigate to "Volumes" or "Storage" section
3. Add the following volume mounts:

```
Host Path: /var/lib/coolify/fortloot-backend/logs
Container Path: /app/logs

Host Path: /var/lib/coolify/fortloot-backend/uploads
Container Path: /app/uploads
```

#### Option 2: Using Docker Compose (if applicable)

If deploying with docker-compose, add volumes:

```yaml
services:
  fortloot-backend:
    volumes:
      - /var/lib/coolify/fortloot-backend/logs:/app/logs
      - /var/lib/coolify/fortloot-backend/uploads:/app/uploads
```

### Initial Setup on Server

SSH into your Hetzner server and create the directories:

```bash
# Create directories
sudo mkdir -p /var/lib/coolify/fortloot-backend/logs
sudo mkdir -p /var/lib/coolify/fortloot-backend/uploads

# Set permissions (adjust UID if needed - default is 1001 from Dockerfile)
sudo chown -R 1001:1001 /var/lib/coolify/fortloot-backend/logs
sudo chown -R 1001:1001 /var/lib/coolify/fortloot-backend/uploads
```

### Accessing Logs

#### View Real-Time Logs

```bash
# All application logs
tail -f /var/lib/coolify/fortloot-backend/logs/application-*.log

# Bot-specific logs
tail -f /var/lib/coolify/fortloot-backend/logs/bot-*.log

# Error logs only
tail -f /var/lib/coolify/fortloot-backend/logs/error-*.log

# Exceptions and crashes
tail -f /var/lib/coolify/fortloot-backend/logs/exceptions.log
tail -f /var/lib/coolify/fortloot-backend/logs/rejections.log

# Watch most recent log file (today)
tail -f /var/lib/coolify/fortloot-backend/logs/application-$(date +%Y-%m-%d).log
```

#### Search Logs

```bash
# Search for specific error
grep -r "error_keyword" /var/lib/coolify/fortloot-backend/logs/

# Search in today's application log
grep "keyword" /var/lib/coolify/fortloot-backend/logs/application-$(date +%Y-%m-%d).log

# Count errors today
grep -c '"level":"error"' /var/lib/coolify/fortloot-backend/logs/application-$(date +%Y-%m-%d).log
```

#### View Structured JSON Logs

Since logs are in JSON format, you can use `jq` for better formatting:

```bash
# Install jq if not available
sudo apt-get install jq

# View formatted logs
tail -f /var/lib/coolify/fortloot-backend/logs/application-*.log | jq '.'

# Filter only errors
cat /var/lib/coolify/fortloot-backend/logs/application-$(date +%Y-%m-%d).log | jq 'select(.level=="error")'

# Filter by botId
cat /var/lib/coolify/fortloot-backend/logs/bot-$(date +%Y-%m-%d).log | jq 'select(.botId=="your-bot-id")'
```

### Log Files Structure

The application generates the following log files:

- **`application-YYYY-MM-DD.log`** - All application logs (debug, info, warn, error)
  - Rotates daily
  - Keeps 14 days of history
  - Max 20MB per file

- **`bot-YYYY-MM-DD.log`** - Bot-specific operations
  - Rotates daily
  - Keeps 7 days of history
  - Max 20MB per file

- **`error-YYYY-MM-DD.log`** - Error-level logs only
  - Rotates daily
  - Keeps 30 days of history
  - Max 20MB per file

- **`exceptions.log`** - Unhandled exceptions
- **`rejections.log`** - Unhandled promise rejections

### Log Maintenance

#### Clean Old Logs

Winston automatically rotates and removes old logs based on the retention policy, but you can manually clean if needed:

```bash
# Remove logs older than 30 days
find /var/lib/coolify/fortloot-backend/logs -name "*.log" -mtime +30 -delete

# Check disk usage
du -sh /var/lib/coolify/fortloot-backend/logs
```

#### Adjust Log Level

To change logging verbosity, update the `LOG_LEVEL` environment variable in Coolify:

```
LOG_LEVEL=debug   # Most verbose (use for troubleshooting)
LOG_LEVEL=info    # Default (production)
LOG_LEVEL=warn    # Only warnings and errors
LOG_LEVEL=error   # Only errors
```

### Troubleshooting

#### Logs not appearing

1. Check container is running: `docker ps`
2. Check volume mount: `docker inspect <container-id> | grep -A 10 Mounts`
3. Check permissions: `ls -la /var/lib/coolify/fortloot-backend/logs`
4. Check logs inside container: `docker exec <container-id> ls -la /app/logs`

#### Permission errors

```bash
# Fix permissions (use UID from Dockerfile, default 1001)
sudo chown -R 1001:1001 /var/lib/coolify/fortloot-backend/logs
sudo chmod -R 755 /var/lib/coolify/fortloot-backend/logs
```

#### Disk space full

```bash
# Check disk usage
df -h

# Find largest log files
du -ah /var/lib/coolify/fortloot-backend/logs | sort -rh | head -20

# Compress old logs
find /var/lib/coolify/fortloot-backend/logs -name "*.log" -mtime +7 -exec gzip {} \;
```

## Environment Variables Reference

Required environment variables for production:

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/fortloot

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# Server
PORT=3001
NODE_ENV=production

# Logging
LOG_LEVEL=info
LOG_DIR=/app/logs

# Encryption (generate with: openssl rand -hex 32)
ENCRYPTION_KEY=your-64-char-hex-string

# Bot Configuration
MAX_GIFTS_PER_DAY=5
FRIENDSHIP_WAIT_HOURS=48
BOT_CHECK_INTERVAL=300000

# CORS
CORS_ALLOWED_DOMAIN=fortlootlatam.com
```

## Post-Deployment Checklist

- [ ] Volumes configured in Coolify
- [ ] Host directories created with correct permissions
- [ ] Environment variables set
- [ ] Container deployed and running
- [ ] Logs appearing in host directory
- [ ] Database migrations applied
- [ ] Bots loaded and authenticated
- [ ] Test order creation working
- [ ] Payment proofs uploading successfully

## Monitoring

Use these commands regularly to monitor the system:

```bash
# Check application health
curl https://your-domain.com/api/health

# Monitor errors in real-time
tail -f /var/lib/coolify/fortloot-backend/logs/error-*.log | jq '.'

# Check bot activity
tail -f /var/lib/coolify/fortloot-backend/logs/bot-*.log | jq 'select(.level=="info")'

# Monitor system startup
tail -f /var/lib/coolify/fortloot-backend/logs/application-*.log | jq 'select(.message | contains("starting"))'
```
