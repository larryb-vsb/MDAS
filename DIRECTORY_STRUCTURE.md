# Directory Structure

This document describes the organized directory structure of the Merchant Management System (MMS).

## Root Directory Files

Essential configuration files only:
- `package.json` / `package-lock.json` - Node.js dependencies
- `tsconfig.json` - TypeScript configuration
- `vite.config.ts` - Vite build tool configuration
- `tailwind.config.ts` - TailwindCSS configuration
- `babel.config.js` - Babel transpiler configuration
- `postcss.config.js` - PostCSS configuration
- `drizzle.config.ts` - Drizzle ORM configuration
- `jest.config.js` / `jest.setup.js` - Jest testing configuration
- `components.json` - shadcn/ui components configuration
- `replit.md` - Project documentation

## Directory Organization

### `/sql/` - SQL Schema Files
Production database schema files with version control:
- `production-schema.sql` - Current production schema (main reference)
- `production-schema-YYYY-MM-DD_HH-MM-SS.sql` - Timestamped schema versions
- Auto-generated via: `NODE_ENV=development npx tsx scripts/simple-schema-dump.ts`

### `/logs/` - Execution Logs
Runtime logs and execution histories:
- `production-schema-run-*.log` - Production schema execution logs

### `/scripts/` - Executable Scripts
Main directory for all scripts:
- `simple-schema-dump.ts` - Production schema generator
- `run-production-schema.sh` - Production schema deployment script
- `cleanup-bad-indexes.sql` - Database maintenance script

#### `/scripts/analysis/` - Analysis & Diagnostic Scripts
Scripts for analyzing database, schema, and system state:
- `check-*.js` - System health checks
- `analyze-*.js` - Data analysis utilities
- `validate-*.js` - Validation scripts
- `database-schema-comparison.js` - Schema comparison tools
- `debug-*.js` - Debugging utilities

#### `/scripts/utilities/` - Utility Scripts
One-off utilities, migrations, and maintenance scripts:
- `cleanup-*.js` - Cleanup utilities
- `import-*.js` - Data import scripts
- `migrate-*.js` - Migration scripts
- `populate-*.js` - Database population scripts
- `process-*.js` - Data processing scripts

### `/docs/` - Documentation
Project documentation and resources:
- `TDDF_API_CONFIG.txt` - TDDF API configuration
- `dbupdate7Nov2025_QUICKSTART.txt` - Quick start guides

#### `/docs/markdown/` - Markdown Documentation
- `*.md` - All project documentation files
- Architecture documents
- API documentation
- Implementation guides

#### `/docs/images/` - Screenshots & Images
- `*.png` - UI screenshots, diagrams, and visual documentation

### `/test-data/` - Test Data & Sample Files
Test data, sample files, and example configurations:
- `config.example.json` - Example configuration files
- `uploader-config.json` - Uploader configuration examples

#### `/test-data/sample-files/` - Sample Data Files
- `*.TSYSO` - TSYS sample files
- `*.csv` - CSV sample data
- `*.xlsx` - Excel sample files

### `/tools/` - External Tools & Utilities
Standalone tools and batch utilities:
- `batch-uploader.py` - Python batch file uploader
- `batch-uploader.ps1` - PowerShell batch file uploader
- `main.py` - Python CLI tools
- `pyproject.toml` / `uv.lock` - Python dependencies

### `/archived/` - Archived & Deprecated Files
Old files kept for reference:
- `*cookies*.txt` - Old authentication cookies
- `backup.json` - Old backups
- `*.log` - Old log files
- Deprecated scripts and temporary files

### `/client/` - Frontend Application
React-based frontend application

### `/server/` - Backend Application
Express.js backend API server

### `/shared/` - Shared Code
TypeScript types and schemas shared between frontend and backend

### `/migrations/` - Database Migrations
Drizzle ORM migration files

### `/uploads/` - User Uploads
Runtime directory for file uploads

### `/tmp_uploads/` - Temporary Uploads
Temporary file storage during processing

## Maintenance

When adding new files:
1. **SQL files** → `/sql/`
2. **Scripts for analysis** → `/scripts/analysis/`
3. **Utility scripts** → `/scripts/utilities/`
4. **Documentation** → `/docs/markdown/`
5. **Screenshots** → `/docs/images/`
6. **Test data** → `/test-data/`
7. **Logs** → `/logs/`
8. **Config files** → Keep in root only if essential

## Regenerating Production Schema

```bash
# Generate new timestamped schema
NODE_ENV=development npx tsx scripts/simple-schema-dump.ts

# Output:
# ✅ Generated: sql/production-schema-YYYY-MM-DD_HH-MM-SS.sql
# 📋 Also saved as: sql/production-schema.sql
```

## Running Against Production

```bash
# Execute with logging
./scripts/run-production-schema.sh

# Output:
# Runs: sql/production-schema.sql
# Logs: logs/production-schema-run-YYYY-MM-DD_HH-MM-SS.log
```
