/**
 * Terminal utility functions for VAR number normalization
 * 
 * VAR Number Format: VXXXXXXX (V followed by 7 digits)
 * 
 * Conversion rules:
 * - 7XXXXXXX (8 digits starting with 7) → VXXXXXXX (replace 7 with V)
 * - 0XXXXXXX (8 digits starting with 0) → VXXXXXXX (replace 0 with V)
 * - VXXXXXXX (already V-prefixed) → VXXXXXXX (keep as-is)
 * - Other 8-digit numbers → VXXXXXXX (replace first digit with V)
 * - Shorter numbers → pad to 7 digits after V
 */

/**
 * Normalize a terminal ID or VAR number to canonical V-format (VXXXXXXX)
 * 
 * @param terminalId - Raw terminal ID from TDDF, CSV, or user input
 * @returns Normalized VAR number in VXXXXXXX format, or null if invalid
 * 
 * @example
 * normalizeVarNumber('78912073')  // → 'V8912073'
 * normalizeVarNumber('00183380')  // → 'V0183380'
 * normalizeVarNumber('10382590')  // → 'V0382590'
 * normalizeVarNumber('V8912073')  // → 'V8912073'
 * normalizeVarNumber('v8912073')  // → 'V8912073'
 * normalizeVarNumber('1234567')   // → 'V1234567'
 * normalizeVarNumber('123456')    // → 'V0123456'
 */
export function normalizeVarNumber(terminalId: string | null | undefined): string | null {
  if (!terminalId) {
    return null;
  }
  
  // Trim and uppercase the input
  const cleaned = terminalId.toString().trim().toUpperCase();
  
  if (!cleaned) {
    return null;
  }
  
  // Already in V-format (VXXXXXXX)
  if (cleaned.startsWith('V')) {
    // Ensure it has exactly 7 digits after V
    const digits = cleaned.substring(1).replace(/\D/g, '');
    if (digits.length === 0) {
      return null;
    }
    // Pad or truncate to 7 digits
    const normalized = digits.padStart(7, '0').substring(0, 7);
    return 'V' + normalized;
  }
  
  // Numeric format - extract digits only
  const digits = cleaned.replace(/\D/g, '');
  
  if (digits.length === 0) {
    return null;
  }
  
  // 8-digit format (7XXXXXXX, 0XXXXXXX, or other)
  // Replace first digit with V, keep remaining 7 digits
  if (digits.length === 8) {
    return 'V' + digits.substring(1);
  }
  
  // 7-digit format - just add V prefix
  if (digits.length === 7) {
    return 'V' + digits;
  }
  
  // Shorter than 7 digits - pad with leading zeros
  if (digits.length < 7) {
    return 'V' + digits.padStart(7, '0');
  }
  
  // Longer than 8 digits - take last 7 digits
  if (digits.length > 8) {
    return 'V' + digits.substring(digits.length - 7);
  }
  
  // Fallback (shouldn't reach here)
  return 'V' + digits.padStart(7, '0').substring(0, 7);
}

/**
 * Validate if a string is a valid VAR number format
 * @param varNumber - The VAR number to validate
 * @returns true if valid VXXXXXXX format
 */
export function isValidVarNumber(varNumber: string | null | undefined): boolean {
  if (!varNumber) {
    return false;
  }
  
  const pattern = /^V\d{7}$/;
  return pattern.test(varNumber.toUpperCase().trim());
}

/**
 * Extract the numeric portion of a VAR number
 * @param varNumber - VAR number in VXXXXXXX format
 * @returns The 7-digit numeric portion, or null if invalid
 */
export function extractVarDigits(varNumber: string | null | undefined): string | null {
  if (!varNumber) {
    return null;
  }
  
  const cleaned = varNumber.toString().trim().toUpperCase();
  
  if (cleaned.startsWith('V') && cleaned.length === 8) {
    const digits = cleaned.substring(1);
    if (/^\d{7}$/.test(digits)) {
      return digits;
    }
  }
  
  return null;
}

/**
 * Generate the original terminal ID formats from a VAR number
 * Used for matching TDDF records that may use 7XXXXXXX or 0XXXXXXX format
 * 
 * @param varNumber - VAR number in VXXXXXXX format
 * @returns Array of possible terminal ID formats [7XXXXXXX, 0XXXXXXX]
 */
export function varNumberToTerminalIds(varNumber: string | null | undefined): string[] {
  const digits = extractVarDigits(varNumber);
  
  if (!digits) {
    return [];
  }
  
  return [
    '7' + digits,  // 7XXXXXXX format
    '0' + digits   // 0XXXXXXX format
  ];
}
