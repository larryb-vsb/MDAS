# Merchant Management System Architecture

## 1. Overview

The Merchant Management System (MMS) is a comprehensive web application designed to help businesses manage merchant relationships, process transactions, and analyze business data. The system provides a dashboard interface for viewing key metrics, managing merchant data, processing data files, visualizing analytics, and performing administrative tasks such as database backups and restores.

## 2. System Architecture

MMS follows a client-server architecture with clear separation between frontend and backend components:

### 2.1 High-Level Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│                 │      │                 │      │                 │
│  React Frontend │<─────│  Express.js API │<─────│  PostgreSQL DB  │
│                 │      │                 │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

- **Frontend**: React-based single-page application (SPA) built with TypeScript and TailwindCSS
- **Backend**: Express.js REST API running on Node.js
- **Database**: PostgreSQL database with Drizzle ORM for schema management and queries
- **State Management**: React Query for server state management and data fetching
- **Routing**: Wouter for client-side routing

## 3. Key Components

### 3.1 Frontend Architecture

The frontend is organized into a component-based architecture using React with TypeScript:

- **Pages**: Located in `client/src/pages/` - Contains top-level page components that correspond to different routes
- **Components**: Located in `client/src/components/` - Reusable UI components organized by feature
  - **UI Components**: Based on shadcn/ui component system which uses Radix UI primitives
  - **Layout Components**: Handle the application's overall layout structure
  - **Feature Components**: Domain-specific components (merchants, uploads, etc.)
- **State Management**: Uses React Query for server state and data fetching
- **Styling**: TailwindCSS with a customized design system

### 3.2 Backend Architecture

The backend follows a RESTful API design pattern:

- **API Routes**: Defined in `server/routes.ts` - Handle HTTP requests and responses
- **Database Layer**: Uses Drizzle ORM with PostgreSQL
- **File Processing**: Handles CSV file uploads and processing with `multer` and CSV parsing libraries
- **Storage Logic**: File storage and retrieval logic in `server/storage.ts`
- **Schema Management**: Tracks database schema versions for migrations

### 3.3 Data Model

The core data model consists of the following entities:

- **Merchants**: Stores merchant information including identification, contact details, and status
- **Transactions**: Records transaction data linked to merchants
- **Uploaded Files**: Tracks files uploaded to the system
- **Backup History**: Records database backup operations
- **Schema Versions**: Tracks database schema versions for migrations

## 4. Data Flow

### 4.1 Merchant Management Flow

1. User creates/edits merchant data through the UI forms
2. Frontend sends requests to the API endpoints
3. Backend validates and persists data to the PostgreSQL database via Drizzle ORM
4. React Query invalidates and refetches data to update the UI

### 4.2 Data Processing Flow

1. User uploads CSV files through the file upload interface
2. Files are temporarily stored on the server
3. Backend processes files, extracts data, and validates it
4. Valid data is inserted into the database
5. Processing results are returned to the frontend
6. Frontend displays success/error messages accordingly

### 4.3 Analytics Flow

1. Frontend requests analytics data from the backend
2. Backend queries the database to aggregate transaction and merchant data
3. Data is transformed into appropriate format for visualization
4. Frontend renders charts and statistics using Recharts library

### 4.4 Backup & Restore Flow

1. User initiates backup from the settings page
2. Backend creates a JSON snapshot of the database
3. User can download the backup file
4. For restore, user uploads a backup file
5. Backend validates and imports the data

## 5. External Dependencies

### 5.1 Frontend Dependencies

- **React**: Core UI library
- **TypeScript**: Static typing
- **TailwindCSS**: Utility-first CSS framework
- **shadcn/ui**: Component system based on Radix UI
- **React Query**: Data fetching and state management
- **Wouter**: Lightweight routing
- **Recharts**: Data visualization components
- **React Hook Form**: Form handling with validation

### 5.2 Backend Dependencies

- **Express.js**: Web framework for Node.js
- **Drizzle ORM**: Database ORM for PostgreSQL
- **multer**: Middleware for handling file uploads
- **CSV libraries**: Processing CSV files (csv-parse, fast-csv)
- **zod**: Schema validation

### 5.3 Development Dependencies

- **Vite**: Build tool and development server
- **Jest & React Testing Library**: Testing framework
- **ESLint & TypeScript**: Code quality and type checking

## 6. Deployment Strategy

The application is configured for deployment in multiple environments:

### 6.1 Development Environment

- Uses Vite's development server with hot module replacement
- Local PostgreSQL database or cloud-based development database

### 6.2 Production Deployment

- Static frontend assets built with Vite and served by Express.js
- Server bundled with esbuild for production
- Deployed in an autoscaling environment (as indicated in the `.replit` configuration)
- Database hosted on Neon (as indicated by the `@neondatabase/serverless` dependency)

### 6.3 CI/CD Pipeline

- GitHub Actions for continuous integration
- Automated testing and linting on pull requests
- Deployment triggers on main branch updates

### 6.4 Database Strategy

- Schema migrations managed through Drizzle kit
- Schema versioning tracked in the database itself
- Regular database backups supported through the application interface

## 7. Cross-Cutting Concerns

### 7.1 Error Handling

- Frontend: Toast notifications for user feedback
- Backend: Structured error responses with HTTP status codes
- API request logging and error tracking

### 7.2 Testing Strategy

- Unit tests for components and utility functions
- Integration tests for API endpoints
- Testing configurations in `jest.config.js` and `jest.setup.js`

### 7.3 Security Considerations

- Input validation with zod schemas
- File upload size and type restrictions
- Database connection security through environment variables

### 7.4 Monitoring & Logging

- API request logging for debugging and monitoring
- Schema version tracking for database changes
- File processing history for audit trails