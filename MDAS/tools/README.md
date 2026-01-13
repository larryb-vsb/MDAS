# MMS Common Tools

This directory contains reusable validation and diagnostic tools for the Merchant Management System.

## Available Tools

### BH-DT-TDDF-Cortex-Validator
**File:** `bh-dt-tddf-cortex-validator.cjs`  
**Purpose:** Comprehensive validation of TDDF BH and DT calculations  
**Credit:** Originally developed in collaboration with Cortex

**Features:**
- Validates TDDF BH Net Deposits (positions 69-83, ÷100)
- Validates TDDF DT Transaction Amounts (positions 93-103, ÷100)
- Compares cached values vs direct calculations
- PowerShell script compliance verification
- Environment-aware table detection
- Data integrity reporting

**Usage:**
```bash
node tools/bh-dt-tddf-cortex-validator.cjs
```

**Output:**
- File-by-file validation results
- Financial totals summary
- Cache consistency checks
- Validation rate percentages
- Mismatch detection and recommendations

**When to Use:**
- After TDDF data processing changes
- Before production deployments
- When investigating calculation discrepancies
- To verify PowerShell script alignment
- During cache rebuild operations

---

## Tool Development Guidelines

1. **Environment Detection:** All tools should detect dev/prod environments
2. **Error Handling:** Graceful failure with clear error messages
3. **Logging:** Comprehensive output for debugging
4. **Schema Flexibility:** Handle multiple table schema versions
5. **Documentation:** Clear usage instructions and examples