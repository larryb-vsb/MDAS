# Merchant Datawarehouse and Automation System (MDAS)

A comprehensive merchant data warehouse for Vermont State Bank that integrates mainframe data processing, merchant management, and financial reporting.

## Features

- **TDDF File Processing** - Automated processing of TSYS mainframe TDDF files with multi-phase pipeline
- **Merchant Management** - Comprehensive merchant data querying and terminal management
- **ACH Deposit Compliance** - Ensure merchant ACH deposit compliance tracking
- **Real-time Analytics** - Dashboard with real-time processing statistics and data visualization
- **API Integrations** - External API for automated file uploads and third-party integrations
- **Transaction Reporting** - Detailed transaction reporting with advanced search capabilities

## Technology Stack

### Frontend
- React with TypeScript (Vite)
- Radix UI primitives with Tailwind CSS (shadcn/ui)
- Real-time data visualization with WebSocket updates
- React Query for data fetching

### Backend
- Node.js with Express.js (TypeScript/ESModules)
- Drizzle ORM for type-safe database operations
- PostgreSQL (Neon serverless) database
- Replit Object Storage for file persistence

### Authentication
- Express-session with PostgreSQL session store
- API key-based authentication for external integrations
- Multi-factor authentication via Duo Security and Azure MSAL

## File Processing Pipeline

The system features a multi-phase file processing pipeline:

1. **Upload** - File ingestion and storage
2. **Validation** - File format and content validation
3. **Parsing** - Data extraction and structuring
4. **Processing** - Record insertion and duplicate handling
5. **Aggregation/Caching** - Pre-computed summaries for dashboard performance

Features include:
- Automatic status tracking
- Dual environment support (development/production)
- Autonomous watcher service for processing
- Database-level concurrency control
- Orphan healing service for stuck files

## Supported File Formats

- TDDF (TSYS Data Definition Format)
- TSYSO
- CSV/TSV
- Excel files

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Development database connection string |
| `NEON_PROD_DATABASE_URL` | Production database connection string |

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables
4. Run development server: `npm run dev`

## License

MIT License

## Version

Current Version: 2.0.4 (January 2026)
