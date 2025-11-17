# Scanly-Watcher Logging Examples

## Emergency Processing Logs

### Alex-Style 4-Phase Emergency Recovery
```json
{
  "level": "info",
  "type": "alex_style_emergency_recovery",
  "message": "Alex-style 4-phase emergency recovery completed: 2850 processed, 1766 appropriately skipped",
  "details": {
    "totalProcessed": 2850,
    "totalSkipped": 1766,
    "totalBacklogCleared": 4616,
    "processingRate": "810 records/minute",
    "totalTimeMs": 341540,
    "phases": [
      {
        "phase": 1,
        "recordsProcessed": 1000,
        "recordTypes": ["DT", "BH"],
        "action": "processed"
      },
      {
        "phase": 2,
        "recordsProcessed": 1500,
        "recordTypes": ["DT", "BH"],
        "action": "processed"
      },
      {
        "phase": 3,
        "recordsProcessed": 350,
        "recordTypes": ["P1"],
        "action": "skipped"
      },
      {
        "phase": 4,
        "recordsProcessed": 1766,
        "recordTypes": ["Other"],
        "action": "skipped"
      }
    ],
    "methodology": "alex_proven_4_phase_approach",
    "authority": "scanly_watcher_autonomous_intervention"
  },
  "timestamp": "2025-07-25T06:49:00.000Z"
}
```

### Emergency Processing Failure
```json
{
  "level": "error",
  "type": "alex_style_emergency_failed",
  "message": "Alex-style emergency processing failed",
  "details": {
    "error": "Database connection timeout",
    "phases": [
      {
        "phase": 1,
        "recordsProcessed": 500,
        "recordTypes": ["DT", "BH"],
        "action": "processed"
      }
    ],
    "partialSuccess": true,
    "recordsProcessedBeforeFailure": 500,
    "methodology": "alex_proven_4_phase_approach",
    "authority": "scanly_watcher_autonomous_intervention"
  },
  "timestamp": "2025-07-25T06:49:00.000Z"
}
```

## System Resource Monitoring Logs

### Memory Usage Critical Alert
```json
{
  "level": "critical",
  "type": "system_resource_alert",
  "message": "CRITICAL: Memory usage exceeded threshold: 92.3%",
  "details": {
    "resourceType": "memory",
    "currentValue": 0.923,
    "threshold": 0.9,
    "alertLevel": "critical",
    "interventionRequired": true,
    "monitoringAuthority": "scanly_watcher_resource_oversight",
    "memoryDetails": {
      "heapUsed": 1847,
      "heapTotal": 2048,
      "totalSystem": 16384,
      "usagePercent": "92.3"
    }
  },
  "timestamp": "2025-07-25T11:45:00.000Z"
}
```

### Database Response Time Warning
```json
{
  "level": "warning",
  "type": "system_resource_alert",
  "message": "WARNING: Database response time approaching threshold: 6500ms",
  "details": {
    "resourceType": "database",
    "currentValue": 6500,
    "threshold": 5000,
    "alertLevel": "warning",
    "interventionRequired": false,
    "monitoringAuthority": "scanly_watcher_resource_oversight",
    "databaseDetails": {
      "responseTimeMs": 6500,
      "connectivityStatus": "connected_warning",
      "thresholdApproached": true
    }
  },
  "timestamp": "2025-07-25T11:45:00.000Z"
}
```

### Database Connectivity Failure
```json
{
  "level": "critical",
  "type": "system_resource_alert",
  "message": "CRITICAL: Database connectivity check failed",
  "details": {
    "resourceType": "database",
    "currentValue": "connection_failed",
    "threshold": "connectivity_required",
    "alertLevel": "critical",
    "interventionRequired": true,
    "monitoringAuthority": "scanly_watcher_resource_oversight",
    "databaseDetails": {
      "connectivityStatus": "failed",
      "error": "Connection timeout after 30000ms",
      "requiresImmediateAttention": true
    }
  },
  "timestamp": "2025-07-25T11:45:00.000Z"
}
```

## Proactive Cleanup Logs

### Successful Cleanup Operations
```json
{
  "level": "info",
  "type": "proactive_cleanup_completed",
  "message": "Proactive system cleanup completed with Alex-level authority: 4 actions performed",
  "details": {
    "actionsPerformed": [
      "Cleaned 50 old alerts from memory",
      "Cleaned 25 old backlog entries from memory",
      "Executed garbage collection",
      "Cleaned 150 old system log entries"
    ],
    "cleanupTrigger": "automated_maintenance",
    "authority": "scanly_watcher_proactive_intervention",
    "alexStyleCleanup": true
  },
  "timestamp": "2025-07-25T11:45:00.000Z"
}
```

### Cleanup Failure
```json
{
  "level": "error",
  "type": "proactive_cleanup_failed",
  "message": "Proactive cleanup with Alex-level authority failed",
  "details": {
    "error": "Database connection lost during log cleanup",
    "partialActions": [
      "Cleaned 50 old alerts from memory",
      "Cleaned 25 old backlog entries from memory"
    ],
    "cleanupTrigger": "automated_maintenance",
    "authority": "scanly_watcher_proactive_intervention"
  },
  "timestamp": "2025-07-25T11:45:00.000Z"
}
```

## Auto-Emergency Processing Trigger

### Automatic Recovery Activation
```json
{
  "level": "info",
  "type": "auto_emergency_recovery",
  "message": "Automatic emergency recovery completed: 3250 records processed using Alex's proven methodology",
  "details": {
    "recordsProcessed": 3250,
    "autoTriggered": true,
    "methodology": "alex_4_phase_approach",
    "backlogThreshold": 1000,
    "currentBacklog": 3250,
    "processingRate": "650 records/minute",
    "authority": "scanly_watcher_autonomous_intervention"
  },
  "timestamp": "2025-07-25T11:45:00.000Z"
}
```

## System Health Check Logs

### Enhanced Health Check Completion
```json
{
  "level": "info",
  "type": "enhanced_health_check_complete",
  "message": "Enhanced health check complete with Alex-level monitoring: 2 alerts generated",
  "details": {
    "alertsGenerated": 2,
    "tddfBacklog": 0,
    "systemResourcesChecked": true,
    "proactiveCleanupPerformed": true,
    "emergencyProcessingTriggered": false,
    "monitoringScope": "comprehensive_system_oversight",
    "authority": "scanly_watcher_enhanced_prerogatives"
  },
  "timestamp": "2025-07-25T11:45:00.000Z"
}
```

## TDDF Backlog Monitoring Logs

### Zero Backlog Achievement
```json
{
  "level": "info",
  "type": "tddf_backlog_zero",
  "message": "✅ TDDF backlog reached zero - processing complete!",
  "details": {
    "currentBacklog": 0,
    "previousBacklog": 25,
    "processingComplete": true,
    "monitoringCycle": 30000,
    "authority": "scanly_watcher_backlog_monitoring"
  },
  "timestamp": "2025-07-25T11:45:00.000Z"
}
```

### Backlog Stall Detection
```json
{
  "level": "warning",
  "type": "tddf_backlog_stall",
  "message": "TDDF processing stall detected: 1250 records unchanged for 2+ minutes",
  "details": {
    "currentBacklog": 1250,
    "stallDuration": 150000,
    "backlogHistory": [1250, 1250, 1250, 1250, 1250],
    "emergencyProcessingRecommended": true,
    "authority": "scanly_watcher_backlog_monitoring"
  },
  "timestamp": "2025-07-25T11:45:00.000Z"
}
```

## Common Log Properties

All Scanly-Watcher logs include these standard properties:
- `level`: info, warning, critical, error
- `type`: Specific event type for filtering and analysis
- `message`: Human-readable description of the event
- `details`: Comprehensive event data with authority tracking
- `timestamp`: ISO 8601 timestamp

### Authority Tracking
Every log includes authority attribution:
- `scanly_watcher_autonomous_intervention`: Emergency processing authority
- `scanly_watcher_resource_oversight`: System resource monitoring authority
- `scanly_watcher_proactive_intervention`: Cleanup and maintenance authority
- `scanly_watcher_backlog_monitoring`: TDDF processing oversight authority
- `scanly_watcher_enhanced_prerogatives`: Comprehensive system authority

### Methodology Attribution
Emergency processing logs reference:
- `alex_proven_4_phase_approach`: Based on Alex's demonstrated emergency recovery methodology
- `alex_style_emergency_processing`: Following Alex's proven batch processing techniques