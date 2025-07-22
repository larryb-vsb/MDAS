# MMS Schema Versioning Policy

## Overview
This document outlines the versioning policy for the Merchant Management System (MMS) database schema to ensure consistent, predictable schema evolution and clear change tracking.

## Version Format
We use **Semantic Versioning (SemVer)** format: `MAJOR.MINOR.PATCH`

### Version Components

#### MAJOR Version (X.0.0)
Increment when making **incompatible schema changes** that require application updates:
- Removing tables or columns
- Changing data types that break compatibility
- Removing or renaming primary/foreign key constraints
- Changes that require data migration scripts

**Examples:**
- Removing the `merchants.clientMID` column
- Changing `transactions.txnAmount` from NUMERIC to TEXT
- Dropping the `uploaded_files` table

#### MINOR Version (0.X.0)  
Increment when adding **new functionality** in a backward-compatible manner:
- Adding new tables
- Adding new columns (with defaults or nullable)
- Adding new indexes for performance
- New features that don't break existing functionality

**Examples:**
- Adding `terminals` table
- Adding `merchants.merchantType` column
- Adding `dev_tddf_records` table for TDDF processing

#### PATCH Version (0.0.X)
Increment for **backward-compatible fixes** and small improvements:
- Documentation updates in schema comments
- Adding missing indexes for existing columns
- Constraint name changes (without behavior change)
- Minor comment or description updates

**Examples:**
- Adding index on `transactions.merchantId`
- Updating table comments with better descriptions
- Fixing constraint naming consistency

## Version History

### Current Version: 1.3.0
- **1.0.0** (May 6, 2025) - Initial schema with core merchant and transaction tables
- **1.1.0** (May 6, 2025) - Enhanced merchant fields with country support  
- **1.2.0** (May 8, 2025) - Added backup scheduling and S3 storage support
- **1.3.0** (July 22, 2025) - Comprehensive TDDF processing with 15 tables, 100+ TDDF fields

## Version Management Process

### 1. Schema Changes
When modifying `shared/schema.ts`:
1. Update the version header comment
2. Document the change type (MAJOR/MINOR/PATCH)
3. List specific changes in the header comments
4. Update the last modified date

### 2. Version Storage
All schema versions are stored in the `schema_content` table with:
- Complete schema content for each version
- Attribution tracking (`stored_by` field)
- Content hashing for integrity verification
- Comprehensive change notes

### 3. Attribution Standards
- **Alex-ReplitAgent**: Current development versions
- **Alex-ReplitAgent-Historical**: Reconstructed historical versions from backup data
- **System**: Legacy automated system updates

## Decision Guidelines

### When to increment MAJOR version:
- Any change that could break existing application code
- Removing functionality that applications depend on
- Changes requiring coordinated application updates

### When to increment MINOR version:
- Adding new tables for new features (TDDF, terminals, etc.)
- Adding optional columns that enhance functionality
- New capabilities that maintain backward compatibility

### When to increment PATCH version:
- Performance improvements (indexes, constraints)
- Documentation and comment improvements
- Non-functional schema maintenance

## Change Documentation Requirements

Each version must include:
- **Version number** following SemVer format
- **Date** of schema change
- **Change summary** describing what was modified
- **Impact assessment** on existing functionality
- **Attribution** to the person/system making changes

## Future Considerations

### Automated Versioning
Consider implementing automated version detection based on:
- Git commit analysis for schema file changes
- Database introspection to detect structural changes
- Integration with CI/CD pipeline for version management

### Migration Scripts
For MAJOR version changes, provide:
- Data migration scripts
- Rollback procedures  
- Testing guidelines for version transitions

### Version Comparison Tools
Enhance the existing version comparison features with:
- Detailed diff analysis between any two versions
- Impact assessment tools for proposed changes
- Automated compatibility checking

## Compliance Notes

This versioning policy ensures:
- **Predictable Evolution**: Clear rules for when versions increment
- **Change Transparency**: Complete history of all schema modifications  
- **Rollback Capability**: Ability to understand and revert changes
- **Collaboration Support**: Clear attribution and change documentation
- **Production Safety**: Controlled approach to schema modifications

---
*Last Updated: July 22, 2025 - Alex-ReplitAgent*
*Policy Version: 1.0.0*