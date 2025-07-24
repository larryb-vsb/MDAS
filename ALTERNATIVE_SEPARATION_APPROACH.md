# TDDF Processing Architecture Comparison

## Current Sequential Approach (Working)

**4-Step Pipeline:**
```
STEP 1: Raw Storage → Store all lines with record type detection
STEP 2: DT Processing → Process only DT records  
STEP 3: BH Processing → Process only BH records
STEP 4: P1 Processing → Process only P1 records
```

**Pros:**
- Fully operational and tested
- Complete transactional integrity per record type
- Easy to debug individual record type issues
- Clear separation of concerns

**Cons:**
- Multiple database queries (one per record type)
- Sequential processing may be slower for large files
- Code duplication across processing methods

## Proposed Switch-Based Approach (Enhancement)

**Single-Pass Processing with Switch Logic:**
```
STEP 1: Raw Storage → Store all lines with record type detection
STEP 2: Unified Processing → Single query, switch on record type
  Query: SELECT * FROM tddf_raw_import WHERE processing_status = 'pending'
  For each record:
    Switch (record_type) {
      case 'BH': processBHRecord(line)
      case 'DT': processDTRecord(line)  
      case 'P1': processP1Record(line)
      case 'P2': processP2Record(line)
      default: skipUnknownRecord(line)
    }
```

**Pros:**
- Single database query for all pending records
- Faster processing for mixed record type files
- Easier to add new record types
- More intuitive processing flow
- Better performance for large files

**Cons:**
- Requires refactoring working code
- More complex error handling (mixed record types in single transaction)
- Harder to isolate issues to specific record types

## Implementation Strategy

### Option 1: Replace Current System
- Refactor `processTddfFileFromContent()` to use switch logic
- Risk: Breaking working production system

### Option 2: Add Switch Method as Alternative  
- Create `processPendingTddfRecordsUnified()` method
- Keep existing methods as fallback
- Test switch approach alongside current system

### Option 3: Hybrid Approach
- Use switch logic for initial record type routing
- Keep individual processing methods for complex logic
- Best of both approaches

## Recommendation

**Option 2** - Add switch method as enhancement while preserving current working system. This allows:
- Testing new approach without risk
- Performance comparison between methods
- Gradual migration if switch approach proves superior
- Fallback to proven sequential method if issues arise

## Switch Implementation Pseudocode

```javascript
async processPendingTddfRecordsUnified(fileId?: string): Promise<ProcessingResult> {
  // Single query for all pending records
  const pendingRecords = await this.getPendingTddfRecords(fileId);
  
  for (const record of pendingRecords) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      switch (record.record_type) {
        case 'BH':
          await this.processBHRecordWithClient(client, record);
          break;
        case 'DT':
          await this.processDTRecordWithClient(client, record);
          break;
        case 'P1':
          await this.processP1RecordWithClient(client, record);
          break;
        case 'P2':
          await this.processP2RecordWithClient(client, record);
          break;
        default:
          await this.skipUnknownRecord(client, record);
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      // Handle error
    } finally {
      client.release();
    }
  }
}
```

This approach provides the benefits of switch-based processing while maintaining our proven transactional integrity patterns.