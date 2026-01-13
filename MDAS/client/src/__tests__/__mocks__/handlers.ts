// Mock API handlers for testing
export const mockDatabaseStats = {
  connectionStatus: "connected",
  version: "PostgreSQL 14.8",
  tables: [
    {
      name: "merchants",
      rowCount: 128,
      sizeBytes: 32768
    },
    {
      name: "transactions",
      rowCount: 1024,
      sizeBytes: 114688
    },
    {
      name: "uploaded_files",
      rowCount: 12,
      sizeBytes: 8192
    },
    {
      name: "backup_history",
      rowCount: 5,
      sizeBytes: 4096
    }
  ],
  totalRows: 1169,
  totalSizeBytes: 159744,
  lastBackup: "2025-05-05T08:30:00.000Z"
};

export const mockBackupHistory = [
  {
    id: "1746480000000",
    timestamp: "2025-05-05T08:30:00.000Z",
    fileName: "backup_20250505_083000.json",
    size: 159744,
    tables: {
      merchants: 128,
      transactions: 1024,
      uploadedFiles: 12
    },
    downloaded: true,
    deleted: false
  },
  {
    id: "1746400000000",
    timestamp: "2025-05-04T10:15:00.000Z",
    fileName: "backup_20250504_101500.json",
    size: 157696,
    tables: {
      merchants: 127,
      transactions: 1020,
      uploadedFiles: 10
    },
    downloaded: true,
    deleted: false
  },
  {
    id: "1746300000000",
    timestamp: "2025-05-03T14:45:00.000Z",
    fileName: "backup_20250503_144500.json",
    size: 155648,
    tables: {
      merchants: 125,
      transactions: 1000,
      uploadedFiles: 8
    },
    downloaded: false,
    deleted: true
  }
];