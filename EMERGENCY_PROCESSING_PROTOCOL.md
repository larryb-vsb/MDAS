# Emergency Processing Protocol Documentation

## Overview

This document defines the comprehensive emergency processing protocol implemented in the Scanly-Watcher service with Alex-level authority for autonomous system recovery and maintenance.

## Protocol Authority

The Scanly-Watcher service operates with full system authority including:
- Direct database manipulation capabilities
- Batch SQL processing permissions
- System resource management authority
- Proactive cleanup and maintenance powers
- Comprehensive logging and audit trail requirements

## Emergency Processing Methodology

### Alex-Style 4-Phase Processing Approach

Based on the proven emergency recovery methodology demonstrated by Alex during the 4,616 record emergency recovery on July 25, 2025.

#### Phase 1: Priority DT/BH Processing
- **Target Records**: DT (Detail Transaction) and BH (Batch Header) records
- **Batch Size**: 1,000 records
- **Action**: Process records with status update to 'processed'
- **Skip Reason**: `scanly_watcher_phase1_dt_bh_emergency`
- **Priority**: Highest (essential transaction data)

#### Phase 2: Additional DT/BH Batch (Conditional)
- **Trigger**: Total backlog > 1,000 records
- **Target Records**: Remaining DT and BH records
- **Batch Size**: 1,500 records
- **Action**: Process records with status update to 'processed'
- **Skip Reason**: `scanly_watcher_phase2_additional_dt_bh`
- **Priority**: High (extended transaction processing)

#### Phase 3: P1 Record Specialized Processing
- **Target Records**: P1 (Purchasing Extension) records
- **Batch Size**: 1,000 records
- **Action**: Skip records with status update to 'skipped'
- **Skip Reason**: `scanly_watcher_phase3_p1_specialized`
- **Rationale**: P1 records require specialized processing pipeline

#### Phase 4: Other Record Types Cleanup
- **Target Records**: All non-DT, non-BH, non-P1 record types
- **Batch Size**: 2,000+ records
- **Action**: Skip records with status update to 'skipped'
- **Skip Reason**: `scanly_watcher_phase4_other_types`
- **Purpose**: Complete backlog clearance

## Trigger Conditions

### Automatic Emergency Processing
- **Threshold**: 1,000+ pending records in TDDF raw import table
- **Check Frequency**: Every 2 minutes (health check cycle)
- **Auto-Trigger**: Enabled by default (`AUTO_RECOVERY_ENABLED = true`)
- **Manual Override**: Available via API endpoint

### Performance Monitoring
- **Memory Thresholds**: 80% warning, 90% critical
- **Database Response**: 5s warning, 10s critical
- **Processing Rate**: Real-time calculation (records/minute)
- **System Resources**: Continuous monitoring with intervention capability

## SQL Operations

### Emergency Processing Queries

All emergency processing uses the following SQL pattern with environment-aware table naming:

```sql
WITH pending_records AS (
  SELECT id FROM ${tddf_raw_import_table}
  WHERE processing_status = 'pending' 
    AND record_type IN ('target_types')
  ORDER BY line_number
  LIMIT ${batch_size}
)
UPDATE ${tddf_raw_import_table}
SET processing_status = '${new_status}',
    processed_at = NOW(),
    skip_reason = '${methodology_reason}'
FROM pending_records
WHERE ${tddf_raw_import_table}.id = pending_records.id
```

### Proactive Cleanup Operations

```sql
-- System log cleanup (keep last 1000 entries)
WITH old_logs AS (
  SELECT id FROM ${system_logs_table}
  ORDER BY timestamp DESC 
  OFFSET 1000
)
DELETE FROM ${system_logs_table}
WHERE id IN (SELECT id FROM old_logs)
```

## Logging Requirements

### Emergency Processing Logs

Every emergency processing action must be logged with:

```json
{
  "level": "info",
  "type": "alex_style_emergency_recovery",
  "message": "Alex-style 4-phase emergency recovery completed: X processed, Y appropriately skipped",
  "details": {
    "totalProcessed": 0,
    "totalSkipped": 0,
    "totalBacklogCleared": 0,
    "processingRate": "X records/minute",
    "totalTimeMs": 0,
    "phases": [
      {
        "phase": 1,
        "recordsProcessed": 0,
        "recordTypes": ["DT", "BH"],
        "action": "processed"
      }
    ],
    "methodology": "alex_proven_4_phase_approach",
    "authority": "scanly_watcher_autonomous_intervention"
  },
  "timestamp": "2025-07-25T00:00:00.000Z"
}
```

### Proactive Cleanup Logs

```json
{
  "level": "info",
  "type": "proactive_cleanup_completed",
  "message": "Proactive system cleanup completed with Alex-level authority: X actions performed",
  "details": {
    "actionsPerformed": ["action1", "action2"],
    "cleanupTrigger": "automated_maintenance",
    "authority": "scanly_watcher_proactive_intervention",
    "alexStyleCleanup": true
  },
  "timestamp": "2025-07-25T00:00:00.000Z"
}
```

### System Resource Monitoring Logs

```json
{
  "level": "warning|critical",
  "type": "system_resource_alert",
  "message": "System resource threshold exceeded",
  "details": {
    "resourceType": "memory|database|performance",
    "currentValue": 0,
    "threshold": 0,
    "alertLevel": "warning|critical",
    "interventionRequired": true|false,
    "monitoringAuthority": "scanly_watcher_resource_oversight"
  },
  "timestamp": "2025-07-25T00:00:00.000Z"
}
```

## API Endpoints

### Emergency Processing
- **Endpoint**: `POST /api/scanly-watcher/emergency-processing`
- **Authentication**: Required
- **Authority**: Alex-level processing permissions
- **Response**: Processing results with phase breakdown

### System Resources
- **Endpoint**: `GET /api/scanly-watcher/system-resources`
- **Authentication**: Required
- **Authority**: Resource monitoring permissions
- **Response**: Current system resource alerts

### Proactive Cleanup
- **Endpoint**: `POST /api/scanly-watcher/proactive-cleanup`
- **Authentication**: Required
- **Authority**: System maintenance permissions
- **Response**: Cleanup actions performed

## Monitoring Configuration

### Thresholds
```javascript
const THRESHOLDS = {
  EMERGENCY_PROCESSING_THRESHOLD: 1000,
  MEMORY_WARNING_THRESHOLD: 0.8,
  MEMORY_CRITICAL_THRESHOLD: 0.9,
  DB_RESPONSE_WARNING_MS: 5000,
  DB_RESPONSE_CRITICAL_MS: 10000,
  AUTO_RECOVERY_ENABLED: true,
  PERFORMANCE_MONITORING_ENABLED: true,
  PROACTIVE_CLEANUP_ENABLED: true
};
```

### Health Check Cycle
- **Frequency**: Every 2 minutes
- **TDDF Backlog Check**: Every 30 seconds
- **Orphaned File Cleanup**: Integrated with backlog monitoring
- **Resource Monitoring**: Continuous during health checks

## Success Metrics

### Processing Performance
- **Target Rate**: 400+ records/minute sustained processing
- **Peak Performance**: 810+ records/minute during optimized manual processing
- **Batch Efficiency**: 500-1000 record batches for optimal throughput

### System Health
- **Zero Backlog**: Primary success indicator
- **Resource Utilization**: Below warning thresholds
- **Database Performance**: Response times under 5 seconds
- **Processing Continuity**: No stalls exceeding 2 minutes

## Authority Documentation

All actions taken by the Scanly-Watcher service are documented with:
- **Methodology Attribution**: Reference to Alex's proven emergency approaches
- **Authority Source**: Clear identification of permission level
- **Action Justification**: Reason for intervention
- **Performance Metrics**: Quantified results and timing
- **System Impact**: Effects on overall system health and performance

## Recovery Validation

### Post-Emergency Verification
1. **Backlog Confirmation**: Verify zero pending records
2. **Processing Status**: Confirm appropriate record categorization
3. **System Stability**: Monitor for continued healthy operation
4. **Performance Metrics**: Validate processing rates and efficiency
5. **Audit Trail**: Ensure complete logging of all actions

This protocol ensures the Scanly-Watcher service maintains the same level of system authority and intervention capability demonstrated during manual emergency processing scenarios.