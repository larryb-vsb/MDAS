import { db } from './db';
import { schemaVersions, type InsertSchemaVersion } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

/**
 * Schema version utility functions for tracking database schema versions
 */
export class SchemaVersionManager {
  /**
   * Get the current schema version
   * @returns The latest schema version or null if none exists
   */
  static async getCurrentVersion() {
    try {
      // Get the most recent version (highest ID) rather than the first one
      const versions = await db.select().from(schemaVersions).orderBy(desc(schemaVersions.id)).limit(1);
      return versions.length > 0 ? versions[0] : null;
    } catch (error) {
      console.error('Error getting current schema version:', error);
      return null;
    }
  }

  /**
   * Get all schema versions
   * @returns Array of all schema versions
   */
  static async getAllVersions() {
    try {
      return await db.select().from(schemaVersions).orderBy(schemaVersions.id);
    } catch (error) {
      console.error('Error getting schema versions:', error);
      return [];
    }
  }

  /**
   * Add a new schema version
   * @param version Schema version details
   * @returns The newly added schema version
   */
  static async addVersion(version: InsertSchemaVersion) {
    try {
      const [newVersion] = await db.insert(schemaVersions).values(version).returning();
      return newVersion;
    } catch (error) {
      console.error('Error adding schema version:', error);
      throw error;
    }
  }

  /**
   * Check if current database schema matches expected version
   * @param expectedVersion The expected schema version string
   * @returns boolean indicating if the versions match
   */
  static async isVersionMatch(expectedVersion: string) {
    const currentVersion = await this.getCurrentVersion();
    return currentVersion?.version === expectedVersion;
  }
}

/**
 * Schema version information
 */
export const CURRENT_SCHEMA_VERSION = '1.1.0';
export const SCHEMA_VERSION_HISTORY = [
  {
    version: '1.0.0',
    description: 'Initial schema with merchants, transactions, uploaded_files, and backup_history tables',
    changes: {
      tables: ['merchants', 'transactions', 'uploaded_files', 'backup_history', 'schema_versions'],
      added: ['clientMID field to merchants table'],
    },
    appliedBy: 'system',
  },
  {
    version: '1.1.0',
    description: 'Added additional merchant fields for enhanced tracking',
    changes: {
      tables: ['merchants'],
      added: [
        'otherClientNumber1 field to merchants table',
        'otherClientNumber2 field to merchants table',
        'clientSinceDate field to merchants table',
        'country field to merchants table',
        'editDate field to merchants table'
      ],
      modified: ['merchants table structure']
    },
    appliedBy: 'system',
  }
];

/**
 * Initialize schema version tracking
 * This should be called during application startup to ensure the schema version is recorded
 */
export async function initializeSchemaVersions() {
  try {
    // Check if schema_versions table exists by trying to query it
    let versionTableExists = true;
    try {
      await SchemaVersionManager.getCurrentVersion();
    } catch (error) {
      versionTableExists = false;
      // Table doesn't exist yet or other error
      console.log('Schema versions table not found or accessible. It will be created with migrations.');
    }

    // If the table exists but has no entries, add the current version
    if (versionTableExists) {
      const versions = await SchemaVersionManager.getAllVersions();
      if (versions.length === 0) {
        const latestVersion = SCHEMA_VERSION_HISTORY[SCHEMA_VERSION_HISTORY.length - 1];
        await SchemaVersionManager.addVersion({
          version: latestVersion.version,
          description: latestVersion.description,
          changes: latestVersion.changes,
          appliedBy: latestVersion.appliedBy,
        });
        console.log(`Initialized schema version tracking with version ${latestVersion.version}`);
      } else {
        const currentVersion = await SchemaVersionManager.getCurrentVersion();
        console.log(`Schema version tracking is active. Current version: ${currentVersion?.version}`);
      }
    }
  } catch (error) {
    console.error('Error initializing schema version tracking:', error);
  }
}