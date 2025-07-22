import { db } from './db';
import { schemaVersions, type InsertSchemaVersion } from '@shared/schema';
import { eq, desc, sql } from 'drizzle-orm';

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
      // Use a direct INSERT statement WITH explicit sequence value for ID
      const result = await db.execute(
        sql`INSERT INTO schema_versions (
          id,
          version, 
          applied_at, 
          description, 
          changes, 
          applied_by, 
          script
        ) VALUES (
          nextval('schema_versions_id_seq'),
          ${version.version}, 
          ${version.appliedAt || new Date()}, 
          ${version.description}, 
          ${version.changes ? JSON.stringify(version.changes) : null}, 
          ${version.appliedBy || 'admin'}, 
          ${version.script || null}
        ) RETURNING *`
      );
      
      // Return the inserted version
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      
      throw new Error('Failed to add schema version - no data returned');
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
export const CURRENT_SCHEMA_VERSION = '2.0.0';
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
  },
  {
    version: '1.2.0',
    description: 'Updated backup system and environment separation',
    changes: {
      tables: ['backup_history'],
      added: [
        'Environment-specific storage paths',
        'Enhanced backup tracking',
        'Environment configuration system'
      ],
      modified: [
        'Backup history table structure',
        'Changed fileSize field to size',
        'Changed tables field to JSONB format'
      ]
    },
    appliedBy: 'system',
  },
  {
    version: '1.3.0',
    description: 'Enhanced schema with complete TDDF processing, field position mappings, and version history tracking',
    changes: {
      tables: ['tddf_records', 'tddf_raw_import', 'schema_versions'],
      added: [
        'Complete TDDF field processing with 100+ fields',
        'Field position mappings for technical transparency',
        'Enhanced version history tracking system',
        'Schema file version documentation header',
        'Color-coded change categorization in UI'
      ],
      modified: [
        'merchant_type field changed from INTEGER to TEXT',
        'Enhanced SchemaVersionInfo widget with diff capabilities',
        'Version comparison functionality added'
      ]
    },
    appliedBy: 'Alex-ReplitAgent',
  },
  {
    version: '2.0.0',
    description: 'MAJOR VERSION - New baseline with database-based schema management system and formal versioning policy',
    changes: {
      tables: ['schema_content', 'all_existing_tables'],
      added: [
        'Database-based schema version storage in schema_content table',
        'Formal Semantic Versioning policy (SCHEMA_VERSIONING_POLICY.md)',
        'Complete historical version reconstruction from backup data',
        'Production-ready MMS with comprehensive TDDF processing capabilities',
        'Attribution system for version tracking (Alex-ReplitAgent vs Alex-ReplitAgent-Historical)',
        'Schema version selector with complete history display',
        'New baseline for future schema evolution'
      ],
      modified: [
        'Schema management from file-based to database-based storage',
        'Version tracking system completely restructured',
        'Schema header updated with complete version history',
        'Production-ready architecture with environment separation'
      ]
    },
    appliedBy: 'Alex-ReplitAgent',
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