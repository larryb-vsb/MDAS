import React, { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link } from "wouter";
import { AlertCircle, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
      <AlertDescription className="space-y-2">
        <p>
          The system is currently running in memory-only fallback mode. All data will be lost when the server restarts.
        </p>
        <p>
          Options to resolve this issue:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Contact your administrator to restore the database connection</li>
          <li>Use the sample backup feature in Settings to create and restore a basic backup file</li>
          <li>Use the new Convert to Database feature to move in-memory data to a database</li>
        </ul>
        <div className="flex items-center gap-2 mt-2">
          <Link to="/settings">
            <Button variant="outline" size="sm" className="flex items-center gap-1">
              <Database className="h-4 w-4" />
              Go to Settings
            </Button>
          </Link>
        </div>
      </AlertDescription>
    </Alert>
  );
};