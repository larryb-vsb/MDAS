import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';

interface UploadNotification {
  id: string;
  fileName: string;
  status: 'completed' | 'error';
  message: string;
  timestamp: Date;
}

interface UploadNotificationSystemProps {
  isActive: boolean;
}

export default function UploadNotificationSystem({ isActive }: UploadNotificationSystemProps) {
  const { toast } = useToast();
  const [processedNotifications, setProcessedNotifications] = useState<Set<string>>(new Set());
  const [lastCheck, setLastCheck] = useState<Date>(new Date());

  // Monitor upload status changes for notifications
  const { data: uploadStatusData } = useQuery({
    queryKey: ["/api/uploads/processing-status"],
    enabled: isActive,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });

  // Check for status changes and send notifications
  useEffect(() => {
    if (!uploadStatusData || !('uploads' in uploadStatusData) || !(uploadStatusData as any)?.uploads || !isActive) return;

    const currentTime = new Date();
    const uploads = (uploadStatusData as any).uploads;

    uploads.forEach((upload: any) => {
      const notificationKey = `${upload.id}_${upload.processingStatus}`;
      
      // Skip if we've already notified about this status
      if (processedNotifications.has(notificationKey)) return;

      // Only notify for files that changed status recently
      const uploadTime = new Date(upload.uploadDate);
      const timeSinceUpload = currentTime.getTime() - uploadTime.getTime();
      
      // Notify for completed files
      if (upload.processingStatus === 'completed' && timeSinceUpload < 300000) { // 5 minutes
        toast({
          title: "✅ File Processing Complete",
          description: `${upload.fileName} has been processed successfully${upload.rawLinesCount ? ` (${upload.rawLinesCount.toLocaleString()} lines)` : ''}`,
          duration: 5000,
        });
        
        setProcessedNotifications(prev => new Set([...Array.from(prev), notificationKey]));
        
        // Update both upload modal and processing monitor
        queryClient.invalidateQueries({ queryKey: ["/api/uploads/history"] });
        queryClient.invalidateQueries({ queryKey: ["/api/uploads/processing-status"] });
      }
      
      // Notify for failed files
      if (upload.processingStatus === 'failed' && timeSinceUpload < 300000) { // 5 minutes
        toast({
          title: "❌ File Processing Failed",
          description: `${upload.fileName} processing failed: ${upload.processingNotes || 'Unknown error'}`,
          variant: "destructive",
          duration: 8000,
        });
        
        setProcessedNotifications(prev => new Set([...Array.from(prev), notificationKey]));
        
        // Update both upload modal and processing monitor
        queryClient.invalidateQueries({ queryKey: ["/api/uploads/history"] });
        queryClient.invalidateQueries({ queryKey: ["/api/uploads/processing-status"] });
      }
    });

    setLastCheck(currentTime);
  }, [uploadStatusData, isActive, processedNotifications, toast]);

  // Clean up old notifications from memory every 10 minutes
  useEffect(() => {
    const cleanup = setInterval(() => {
      setProcessedNotifications(prev => {
        // Keep only last 100 notifications to prevent memory buildup
        const arr = [...prev];
        return new Set(arr.slice(-100));
      });
    }, 600000); // 10 minutes

    return () => clearInterval(cleanup);
  }, []);

  return null; // This is a notification service component, no UI needed
}