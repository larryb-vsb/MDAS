import { generateTestLogs } from './test-logs';

/**
 * Initialize sample logs for all log types
 * This function creates sample logs for each log type 
 * when the application starts
 */
export async function initSampleLogs() {
  try {
    console.log('Initializing sample logs for demonstration...');
    
    // Generate audit logs
    await generateTestLogs('audit');
    
    // Generate system logs
    await generateTestLogs('system');
    
    // Generate security logs
    await generateTestLogs('security');
    
    console.log('Sample logs initialized successfully');
  } catch (error) {
    console.error('Error initializing sample logs:', error);
  }
}