# Verbose Logging API Documentation

## Overview
The Verbose Logging API provides runtime control over MMS logging levels for automation and AI monitoring systems. Configure logging granularity on-the-fly without server restarts.

## API Endpoints

All endpoints require authentication (session-based).

### GET `/api/system/verbose-config`
Retrieve current verbose logging configuration.

**Request:**
```bash
curl -X GET http://localhost:5000/api/system/verbose-config \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

**Response:**
```json
{
  "success": true,
  "config": {
    "auth": false,
    "navigation": false,
    "uploader": false,
    "charts": false,
    "tddfProcessing": true,
    "database": false,
    "all": false
  },
  "timestamp": "2025-11-05T19:47:36.123Z"
}
```

### PUT `/api/system/verbose-config`
Update verbose logging configuration for specific modules.

**Request:**
```bash
curl -X PUT http://localhost:5000/api/system/verbose-config \
  -H "Content-Type: application/json" \
  -d '{"tddfProcessing":false,"uploader":true}' \
  -b cookies.txt
```

**Response:**
```json
{
  "success": true,
  "message": "Verbose logging configuration updated",
  "config": {
    "auth": false,
    "navigation": false,
    "uploader": true,
    "charts": false,
    "tddfProcessing": false,
    "database": false,
    "all": false
  },
  "updated": {
    "tddfProcessing": false,
    "uploader": true
  },
  "timestamp": "2025-11-05T19:47:40.456Z"
}
```

### POST `/api/system/verbose-config/reset`
Reset all logging configuration to default values.

**Request:**
```bash
curl -X POST http://localhost:5000/api/system/verbose-config/reset \
  -H "Content-Type: application/json" \
  -b cookies.txt
```

**Response:**
```json
{
  "success": true,
  "message": "Verbose logging configuration reset to defaults",
  "config": {
    "auth": false,
    "navigation": false,
    "uploader": false,
    "charts": false,
    "tddfProcessing": true,
    "database": false,
    "all": false
  },
  "timestamp": "2025-11-05T19:47:45.789Z"
}
```

## Logging Modules

| Module | Description | Default |
|--------|-------------|---------|
| `auth` | Authentication flow and user login/logout events | `false` |
| `navigation` | Route access and navigation tracking | `false` |
| `uploader` | File upload operations and progress | `false` |
| `charts` | Data visualization and chart generation | `false` |
| `tddfProcessing` | TDDF pipeline processing (main source of logs) | `true` |
| `database` | SQL query logging (very verbose) | `false` |
| `all` | Global override - enables all modules | `false` |

## Configuration Behavior

- **Runtime Only**: Changes persist only during current server session
- **Restart Reset**: Server restart reverts to environment variable defaults
- **Immediate Effect**: Configuration changes apply instantly without restart
- **Override Logic**: Setting `all: true` enables all other modules

## Authentication

All endpoints require a valid session. Login first:

```bash
# Login to get session cookie
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"your-username","password":"your-password"}' \
  -c cookies.txt

# Then use -b cookies.txt for subsequent requests
```

## Use Cases

### AI Monitoring System
Dynamically adjust logging based on detected anomalies:
```bash
# Normal operation - minimal logging
PUT /api/system/verbose-config
{"tddfProcessing": false, "database": false}

# Anomaly detected - enable detailed logging
PUT /api/system/verbose-config
{"tddfProcessing": true, "database": true, "uploader": true}

# Issue resolved - restore normal logging
POST /api/system/verbose-config/reset
```

### Automated Health Checks
Enable logging during scheduled maintenance:
```bash
# Pre-maintenance: Enable all logging
PUT /api/system/verbose-config
{"all": true}

# Post-maintenance: Reset to defaults
POST /api/system/verbose-config/reset
```

### Debug Specific Subsystems
Focus on particular components:
```bash
# Debug authentication issues
PUT /api/system/verbose-config
{"auth": true, "navigation": true}

# Debug file processing
PUT /api/system/verbose-config
{"uploader": true, "tddfProcessing": true}

# Debug database performance
PUT /api/system/verbose-config
{"database": true}
```

## Error Handling

### Invalid Configuration Key
**Request:**
```json
{"invalidKey": true}
```

**Response (400):**
```json
{
  "error": "Invalid configuration keys",
  "invalidKeys": ["invalidKey"],
  "validKeys": ["auth", "navigation", "uploader", "charts", "tddfProcessing", "database", "all"]
}
```

### Invalid Value Type
**Request:**
```json
{"auth": "yes"}
```

**Response (400):**
```json
{
  "error": "Value for 'auth' must be boolean",
  "received": "string"
}
```

### Not Authenticated
**Response (401):**
```json
{
  "error": "Not authenticated"
}
```

## Environment Variables (Default Configuration)

Set these in `.env` to configure startup defaults:

```bash
VERBOSE_AUTH_DEBUG=false
VERBOSE_NAVIGATION=false
VERBOSE_UPLOADER=false
VERBOSE_CHARTS=false
VERBOSE_TDDF_PROCESSING=true
VERBOSE_DATABASE=false
VERBOSE_ALL=false
```

## Examples

See:
- `test-verbose-api.sh` - Comprehensive API testing script
- `examples/verbose-automation-example.sh` - Automation scenarios

## Best Practices

1. **Minimize Database Logging**: Only enable `database: true` when actively debugging SQL issues (extremely verbose)
2. **Use Module-Specific Settings**: Target specific modules instead of `all: true` to reduce noise
3. **Reset After Debugging**: Always reset to defaults after troubleshooting to avoid performance impact
4. **Monitor Log Volume**: High verbosity can impact performance and disk space
5. **Coordinate with Team**: Communicate when changing logging levels in shared environments

## Performance Impact

| Module | Impact | Notes |
|--------|--------|-------|
| `auth` | Low | Occasional log entries |
| `navigation` | Low | One log per route access |
| `uploader` | Medium | Active during file uploads |
| `charts` | Medium | Active during data visualization |
| `tddfProcessing` | High | Continuous background processing |
| `database` | Very High | Every SQL query logged |
| `all` | Very High | Maximum verbosity |

## Support

For questions or issues with the Verbose Logging API:
- Check current configuration: `GET /api/system/verbose-config`
- Review server logs for configuration changes
- Reset to defaults if unsure: `POST /api/system/verbose-config/reset`
