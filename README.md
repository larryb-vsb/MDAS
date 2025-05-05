# Merchant Management System

A comprehensive dashboard for managing merchants, processing transactions, and analyzing business data.

## Features

- **Dashboard**: View key metrics and recent transactions
- **Merchant Management**: Add, edit, and filter merchant data
- **Data Processing**: Upload and process merchant and transaction data files
- **Analytics**: Visualize transaction trends and merchant category distribution
- **Exports**: Export data to CSV files for further analysis
- **Backup & Restore**: Create database backups and restore when needed

## Tech Stack

- **Frontend**: React, TypeScript, TailwindCSS, shadcn/ui components
- **Backend**: Express.js (Node.js)
- **Database**: PostgreSQL via Drizzle ORM
- **State Management**: React Query
- **Routing**: Wouter
- **File Processing**: multer, csv-parse, fast-csv
- **Testing**: Jest, React Testing Library

## Getting Started

### Prerequisites

- Node.js (v18+)
- PostgreSQL database

### Installation

1. Clone the repository:
```
git clone https://github.com/larryb-vsb/MMS.git
cd MMS
```

2. Install dependencies:
```
npm install
```

3. Set up the database:
```
npm run db:push
```

### Running the Application

Start the development server:
```
npm run dev
```

The application will be available at http://localhost:5000.

### Testing

Run the test suite:
```
npm test
```

## Project Structure

- `/client`: Frontend React application
  - `/src/components`: UI components
  - `/src/pages`: Application pages
  - `/src/lib`: Utility functions and types
  - `/src/__tests__`: Test files
- `/server`: Backend Express application
  - `/routes.ts`: API endpoints
  - `/storage.ts`: Data storage interface
  - `/db.ts`: Database connection
- `/shared`: Shared code between frontend and backend
  - `/schema.ts`: Database schema using Drizzle ORM

## API Endpoints

- `/api/merchants`: Merchant management
- `/api/stats`: Dashboard statistics
- `/api/settings`: Application settings and backups
- `/api/exports`: Data export functionality

## Database Schema

- `merchants`: Merchant demographic data
- `transactions`: Transaction records
- `uploadedFiles`: Records of uploaded data files
- `backupHistory`: Database backup history and metadata

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.