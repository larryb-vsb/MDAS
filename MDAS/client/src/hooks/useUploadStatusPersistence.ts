import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

interface UploadStatus {
  id: string;
  fileName: string;
  status: 'uploading' | 'queued' | 'processing' | 'completed' | 'error';
  progress: number;
  rawLinesCount?: number;
  uploadDate: string;
  processingNotes?: string;
}

interface PersistedUploadSession {
  sessionId: string;
  uploads: UploadStatus[];
  lastUpdated: Date;
  isActive: boolean;
}

const STORAGE_KEY = 'mms_upload_sessions';
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

export function useUploadStatusPersistence(sessionId?: string) {
  const [currentSessionId] = useState(() => sessionId || `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [persistedStatus, setPersistedStatus] = useState<UploadStatus[]>([]);

  // Load persisted status from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const sessions: PersistedUploadSession[] = JSON.parse(stored);
        const currentSession = sessions.find(s => s.sessionId === currentSessionId);
        
        if (currentSession && currentSession.isActive) {
          // Check if session is still valid (not expired)
          const sessionAge = Date.now() - new Date(currentSession.lastUpdated).getTime();
          if (sessionAge < SESSION_TIMEOUT) {
            setPersistedStatus(currentSession.uploads);
          }
        }
      }
    } catch (error) {
      console.error('[UPLOAD-PERSISTENCE] Error loading persisted status:', error);
    }
  }, [currentSessionId]);

  // Query live status from server
  const { data: liveStatusData } = useQuery({
    queryKey: ["/api/uploads/processing-status"],
    refetchInterval: 2000,
    enabled: persistedStatus.length > 0,
  });

  // Merge live data with persisted data
  useEffect(() => {
    if (liveStatusData && ('uploads' in liveStatusData) && (liveStatusData as any)?.uploads && persistedStatus.length > 0) {
      const updatedStatus = persistedStatus.map(persisted => {
        const live = (liveStatusData as any).uploads.find((u: any) => u.id === persisted.id);
        if (live) {
          return {
            ...persisted,
            status: live.processingStatus || persisted.status,
            progress: live.processingStatus === 'completed' ? 100 :
                     live.processingStatus === 'processing' ? 75 :
                     live.processingStatus === 'queued' ? 50 : persisted.progress,
            rawLinesCount: live.rawLinesCount || persisted.rawLinesCount,
            processingNotes: live.processingNotes
          };
        }
        return persisted;
      });
      
      setPersistedStatus(updatedStatus);
      saveToStorage(updatedStatus, true);
    }
  }, [liveStatusData, persistedStatus]);

  // Save status to localStorage
  const saveToStorage = (uploads: UploadStatus[], isActive: boolean = true) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      let sessions: PersistedUploadSession[] = stored ? JSON.parse(stored) : [];
      
      // Remove expired sessions
      const now = Date.now();
      sessions = sessions.filter(s => {
        const age = now - new Date(s.lastUpdated).getTime();
        return age < SESSION_TIMEOUT;
      });
      
      // Update or add current session
      const sessionIndex = sessions.findIndex(s => s.sessionId === currentSessionId);
      const sessionData: PersistedUploadSession = {
        sessionId: currentSessionId,
        uploads,
        lastUpdated: new Date(),
        isActive
      };
      
      if (sessionIndex >= 0) {
        sessions[sessionIndex] = sessionData;
      } else {
        sessions.push(sessionData);
      }
      
      // Keep only last 10 sessions to prevent storage bloat
      sessions = sessions.slice(-10);
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.error('[UPLOAD-PERSISTENCE] Error saving to storage:', error);
    }
  };

  // Update persisted status
  const updatePersistedStatus = (uploads: UploadStatus[]) => {
    setPersistedStatus(uploads);
    saveToStorage(uploads, true);
  };

  // Mark session as inactive (when modal is closed)
  const markSessionInactive = () => {
    saveToStorage(persistedStatus, false);
  };

  // Clear session data
  const clearSession = () => {
    setPersistedStatus([]);
    saveToStorage([], false);
  };

  // Get active uploads count
  const getActiveUploadsCount = () => {
    return persistedStatus.filter(u => 
      u.status !== 'completed' && u.status !== 'error'
    ).length;
  };

  // Get completion status
  const getCompletionStatus = () => {
    const total = persistedStatus.length;
    const completed = persistedStatus.filter(u => u.status === 'completed').length;
    const failed = persistedStatus.filter(u => u.status === 'error').length;
    const processing = persistedStatus.filter(u => 
      u.status === 'processing' || u.status === 'queued' || u.status === 'uploading'
    ).length;
    
    return {
      total,
      completed,
      failed,
      processing,
      isComplete: processing === 0
    };
  };

  return {
    sessionId: currentSessionId,
    persistedStatus,
    updatePersistedStatus,
    markSessionInactive,
    clearSession,
    getActiveUploadsCount,
    getCompletionStatus,
    hasActiveUploads: persistedStatus.length > 0
  };
}