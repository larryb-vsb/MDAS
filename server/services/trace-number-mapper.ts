/**
 * Trace Number to Transaction ID Mapping Service
 * Handles unique transaction ID generation from trace numbers with duplicate handling
 */

export interface TraceNumberStats {
  totalUniqueTraces: number;
  duplicatesFound: number;
  totalProcessed: number;
  duplicationRate: number;
}

export class TraceNumberMapper {
  private static traceCounter: Map<string, number> = new Map();
  private static totalProcessed = 0;
  
  /**
   * Maps a trace number to a unique transaction ID
   * For duplicates, appends increment counter (trace-1, trace-2, etc.)
   */
  static generateTransactionId(traceNumber: string | null): string {
    this.totalProcessed++;
    
    if (!traceNumber) {
      // Generate a fallback ID if no trace number
      return `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Clean trace number (remove any non-alphanumeric characters and handle scientific notation)
    let cleanTrace = traceNumber.toString();
    
    // Handle scientific notation (e.g., "7.11E+13" -> "71100000000000")
    if (cleanTrace.includes('E+') || cleanTrace.includes('e+')) {
      const num = parseFloat(cleanTrace);
      if (!isNaN(num)) {
        cleanTrace = Math.floor(num).toString();
      }
    }
    
    // Remove any non-alphanumeric characters
    cleanTrace = cleanTrace.replace(/[^a-zA-Z0-9]/g, '');
    
    // Ensure we have a valid trace number
    if (!cleanTrace || cleanTrace.length === 0) {
      return `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Check if we've seen this trace number before
    if (this.traceCounter.has(cleanTrace)) {
      // Increment counter for this trace number
      const currentCount = this.traceCounter.get(cleanTrace)! + 1;
      this.traceCounter.set(cleanTrace, currentCount);
      console.log(`🔄 [TRACE-MAPPER] Duplicate trace number found: ${cleanTrace} -> ${cleanTrace}-${currentCount}`);
      return `${cleanTrace}-${currentCount}`;
    } else {
      // First time seeing this trace number
      this.traceCounter.set(cleanTrace, 0);
      console.log(`✅ [TRACE-MAPPER] New trace number mapped: ${traceNumber} -> ${cleanTrace}`);
      return cleanTrace;
    }
  }
  
  /**
   * Reset the counter (useful for new file processing sessions)
   */
  static resetCounter(): void {
    console.log(`🔄 [TRACE-MAPPER] Resetting counter. Previous stats: ${this.getStats().totalUniqueTraces} unique traces, ${this.getStats().duplicatesFound} duplicates`);
    this.traceCounter.clear();
    this.totalProcessed = 0;
  }
  
  /**
   * Get current mapping statistics
   */
  static getStats(): TraceNumberStats {
    let duplicatesFound = 0;
    for (const count of this.traceCounter.values()) {
      if (count > 0) duplicatesFound++;
    }
    
    return {
      totalUniqueTraces: this.traceCounter.size,
      duplicatesFound,
      totalProcessed: this.totalProcessed,
      duplicationRate: this.totalProcessed > 0 ? (duplicatesFound / this.totalProcessed) * 100 : 0
    };
  }
  
  /**
   * Get detailed mapping info for debugging
   */
  static getDetailedStats(): { 
    stats: TraceNumberStats; 
    duplicateDetails: { traceNumber: string; occurrences: number }[] 
  } {
    const stats = this.getStats();
    const duplicateDetails: { traceNumber: string; occurrences: number }[] = [];
    
    for (const [traceNumber, count] of this.traceCounter.entries()) {
      if (count > 0) {
        duplicateDetails.push({ traceNumber, occurrences: count + 1 });
      }
    }
    
    return { stats, duplicateDetails };
  }
  
  /**
   * Check if a trace number would be a duplicate without incrementing
   */
  static wouldBeDuplicate(traceNumber: string | null): boolean {
    if (!traceNumber) return false;
    
    let cleanTrace = traceNumber.toString();
    if (cleanTrace.includes('E+') || cleanTrace.includes('e+')) {
      const num = parseFloat(cleanTrace);
      if (!isNaN(num)) {
        cleanTrace = Math.floor(num).toString();
      }
    }
    cleanTrace = cleanTrace.replace(/[^a-zA-Z0-9]/g, '');
    
    return this.traceCounter.has(cleanTrace);
  }
}