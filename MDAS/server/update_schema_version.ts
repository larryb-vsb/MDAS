import { db } from './db';
import { schemaVersions } from '@shared/schema';
import { CURRENT_SCHEMA_VERSION, SCHEMA_VERSION_HISTORY, SchemaVersionManager } from './schema_version';

/**
 * Update schema version to match current version
 */
async function updateSchemaVersion() {
  try {
    console.log('Updating schema version...');
    
    // Get current version in database
    const currentVersion = await SchemaVersionManager.getCurrentVersion();
    console.log(`Current database schema version: ${currentVersion?.version || 'None'}`);
    
    // Get latest version from history
    const latestVersionInfo = SCHEMA_VERSION_HISTORY[SCHEMA_VERSION_HISTORY.length - 1];
    console.log(`Latest schema version: ${latestVersionInfo.version}`);
    
    // If current version is already latest, we're done
    if (currentVersion?.version === latestVersionInfo.version) {
      console.log('Database schema is already at the latest version.');
      return;
    }
    
    // Add the latest version
    await SchemaVersionManager.addVersion({
      version: latestVersionInfo.version,
      description: latestVersionInfo.description,
      changes: latestVersionInfo.changes,
      appliedBy: latestVersionInfo.appliedBy,
    });
    
    console.log(`Updated schema version to ${latestVersionInfo.version}`);
  } catch (error) {
    console.error('Error updating schema version:', error);
  } finally {
    process.exit(0);
  }
}

// Run the update
updateSchemaVersion();