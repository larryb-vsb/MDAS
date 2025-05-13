import React, { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from 'lucide-react';

// Component to display a warning when the system is in fallback mode
export const FallbackStorageAlert: React.FC = () => {
  const [isInFallbackMode, setIsInFallbackMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkFallbackStatus = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/system/info');
        if (!response.ok) {
          throw new Error('Failed to fetch system info');
        }
        const data = await response.json();
        
        // Check if system is in fallback mode
        if (data.storage && data.storage.fallbackMode === true) {
          setIsInFallbackMode(true);
        } else {
          setIsInFallbackMode(false);
        }
      } catch (error) {
        console.error('Error checking fallback status:', error);
        // If we can't connect to the API, assume we're not in fallback mode
        setIsInFallbackMode(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkFallbackStatus();
  }, []);

  if (isLoading || !isInFallbackMode) return null;

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Database Unavailable</AlertTitle>
      <AlertDescription>
        The system is currently running in memory-only fallback mode. All data will be lost when the server restarts.
        Please contact your administrator to restore the database connection.
      </AlertDescription>
    </Alert>
  );
};