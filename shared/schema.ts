import { pgTable, text, serial, integer, numeric, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Merchants table
export const merchants = pgTable("merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  clientMID: text("client_mid"),
  status: text("status").notNull().default("Pending"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  category: text("category"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUploadDate: timestamp("last_upload_date")
});

// Transactions table
export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  date: timestamp("date").defaultNow().notNull(),
  type: text("type").notNull().default("Sale")
});

// Uploaded files table
export const uploadedFiles = pgTable("uploaded_files", {
  id: text("id").primaryKey(),
  originalFilename: text("original_filename").notNull(),
  storagePath: text("storage_path").notNull(),
  fileType: text("file_type").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  processed: boolean("processed").default(false).notNull(),
  processingErrors: text("processing_errors")
});

// Backup history table
export const backupHistory = pgTable("backup_history", {
  id: text("id").primaryKey(),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  size: integer("size").notNull(),
  tables: jsonb("tables").notNull(), // Store table counts as JSON
  notes: text("notes"),
  downloaded: boolean("downloaded").default(false).notNull(),
  deleted: boolean("deleted").default(false).notNull()
});

// Zod schemas for merchants
export const merchantsSchema = createInsertSchema(merchants);
export const insertMerchantSchema = merchantsSchema.omit({ id: true });

// Zod schemas for transactions
export const transactionsSchema = createInsertSchema(transactions);
export const insertTransactionSchema = transactionsSchema.omit({ id: true });

// Zod schemas for uploaded files
export const uploadedFilesSchema = createInsertSchema(uploadedFiles);
export const insertUploadedFileSchema = uploadedFilesSchema.omit({ id: true });

// Zod schemas for backup history
export const backupHistorySchema = createInsertSchema(backupHistory);
export const insertBackupHistorySchema = backupHistorySchema.omit({ id: true });

// Export types
export type Merchant = typeof merchants.$inferSelect;
export type InsertMerchant = typeof merchants.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;
export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type InsertUploadedFile = typeof uploadedFiles.$inferInsert;
export type BackupHistory = typeof backupHistory.$inferSelect;
export type InsertBackupHistory = typeof backupHistory.$inferInsert;
