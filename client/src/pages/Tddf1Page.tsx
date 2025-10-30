import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Database,
  FileText,
  TrendingUp,
  DollarSign,
  Activity,
  ArrowLeft,
  RefreshCw,
  Sun,
  Moon,
  Building2,
  X,
  Table as TableIcon,
} from "lucide-react";
import { format, addDays, subDays, isToday, getDay } from "date-fns";
import { isNonProcessingDay, isFederalHoliday } from "@/lib/federal-holidays";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tddf1MerchantVolumeTab } from "@/components/Tddf1MerchantVolumeTab";

import { cn, formatCompactCurrency, parseTddfFilename, formatProcessingTime } from "@/lib/utils";

interface Tddf1Stats {
  totalFiles: number;
  totalRecords: number;
  totalTransactionValue: number;
  totalNetDeposits?: number;
  totalTransactionAmounts?: number;
  recordTypeBreakdown: Record<string, number>;
  activeTables: string[];
  lastProcessedDate: string | null;
  // Enhanced breakdown fields
  fileName?: string;
  processingDurationMs?: number;
  totalTddfLines?: number;
  totalJsonLinesInserted?: number;
  processingStartTime?: string;
  processingEndTime?: string;
  validationSummary?: Record<string, any>;
  performanceMetrics?: Record<string, any>;
  cached?: boolean;
  cacheDate?: string;
  lastUpdated?: string;
}

interface Tddf1DayBreakdown {
  date: string;
  totalRecords: number;
  recordTypes: Record<string, number>;
  transactionValue: number;
  totalTransactionValue?: number; // Primary field from backend
  netDeposits?: number; // Primary field from backend
  netDepositsValue?: number;
  transactionAmountsValue?: number;
  totalNetDepositBH?: number;
  batchCount?: number; // BH record count (batches with Net Deposits)
  authorizationCount?: number; // DT record count (individual Authorization transactions)
  batchTotal?: number; // BH Net Deposit total
  authorizationTotal?: number; // DT Authorization transaction total
  fileCount: number;
  tables: string[];
  filesProcessed: Array<{
    fileName: string;
    tableName: string;
    recordCount: number;
    processingTime?: number;
    fileSize?: string;
  }>;
}

interface Tddf1RecentActivity {
  id: string;
  fileName: string;
  recordCount: number;
  processedAt: string;
  status: string;
  tableName: string;
}

interface DraggableCircle {
  id: string;
  x: number;
  y: number;
  color: string;
  value: string;
  label: string;
  isDragging: boolean;
}

interface Tddf1EncodingProgress {
  uploadId: string;
  filename: string;
  status: "not_started" | "started" | "encoding" | "completed";
  progress: number;
  currentRecords: number;
  estimatedTotal: number;
  actualFileSize?: number;
  recordBreakdown: Record<string, number>;
  tableName: string;
  phase: string;
  lastUpdated: string;
}

interface Tddf1PipelineStatus {
  totalFiles: number;
  uploadedFiles: number;
  identifiedFiles: number;
  encodingFiles: number;
  encodedFiles: number;
  failedFiles: number;
  lastActivity: string | null;
  phaseBreakdown: Record<string, number>;
  lastUpdated: string;
}

// Draggable Circles Component
function DraggableCircles({
  circles,
  onCircleUpdate,
  containerRef,
}: {
  circles: DraggableCircle[];
  onCircleUpdate: (circles: DraggableCircle[]) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [isSettling, setIsSettling] = useState(false);
  const animationRef = useRef<number | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, circleId: string) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const circle = circles.find((c) => c.id === circleId);
      if (!circle) return;

      setDragOffset({
        x: e.clientX - rect.left - circle.x,
        y: e.clientY - rect.top - circle.y,
      });

      const updatedCircles = circles.map((c) =>
        c.id === circleId ? { ...c, isDragging: true } : c,
      );
      onCircleUpdate(updatedCircles);
    },
    [circles, containerRef, onCircleUpdate],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragOffset || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const draggingCircle = circles.find((c) => c.isDragging);
      if (!draggingCircle) return;

      const draggingRadius =
        draggingCircle.id === "auth" || draggingCircle.id === "deposits"
          ? 56
          : 48;

      // Smooth movement with reduced sensitivity
      const targetX = e.clientX - rect.left - dragOffset.x;
      const targetY = e.clientY - rect.top - dragOffset.y;

      // Lerp for smoother movement (0.3 = 30% interpolation for slower movement)
      const lerpFactor = 0.3;
      const newX = Math.max(
        draggingRadius,
        Math.min(
          rect.width - draggingRadius,
          draggingCircle.x + (targetX - draggingCircle.x) * lerpFactor,
        ),
      );
      const newY = Math.max(
        draggingRadius,
        Math.min(
          rect.height - draggingRadius,
          draggingCircle.y + (targetY - draggingCircle.y) * lerpFactor,
        ),
      );

      // Check for collisions with other circles and push them away
      const otherCircles = circles.filter((c) => c.id !== draggingCircle.id);

      let adjustedCircles = [...circles];

      otherCircles.forEach((otherCircle) => {
        const otherRadius =
          otherCircle.id === "auth" || otherCircle.id === "deposits" ? 56 : 48;
        const minDistance = draggingRadius + otherRadius + 20; // Minimum distance = sum of radii + buffer

        const dx = newX - otherCircle.x;
        const dy = newY - otherCircle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < minDistance && distance > 0) {
          // Calculate push direction (away from dragging circle)
          const angle = Math.atan2(dy, dx);
          const pushDistance = minDistance - distance;

          // Push the other circle away from the dragging circle
          const pushX = Math.cos(angle) * pushDistance;
          const pushY = Math.sin(angle) * pushDistance;

          const newOtherX = Math.max(
            otherRadius,
            Math.min(rect.width - otherRadius, otherCircle.x + pushX),
          );
          const newOtherY = Math.max(
            otherRadius,
            Math.min(rect.height - otherRadius, otherCircle.y + pushY),
          );

          adjustedCircles = adjustedCircles.map((c) =>
            c.id === otherCircle.id ? { ...c, x: newOtherX, y: newOtherY } : c,
          );
        }
      });

      // Update the dragging circle position
      const updatedCircles = adjustedCircles.map((c) =>
        c.isDragging ? { ...c, x: newX, y: newY } : c,
      );
      onCircleUpdate(updatedCircles);
    },
    [dragOffset, circles, containerRef, onCircleUpdate],
  );

  const handleMouseUp = useCallback(() => {
    setDragOffset(null);
    const updatedCircles = circles.map((c) => ({ ...c, isDragging: false }));
    onCircleUpdate(updatedCircles);

    // Start settling animation
    setIsSettling(true);

    // Start the settling animation with a small delay
    setTimeout(() => {
      if (!containerRef.current) return;

      const animate = () => {
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        let hasMovement = false;

        const settledCircles = updatedCircles.map((circle) => {
          if (circle.isDragging) return circle;

          const radius =
            circle.id === "auth" || circle.id === "deposits" ? 56 : 48;
          let newX = circle.x;
          let newY = circle.y;

          // Check collisions and gently push away
          updatedCircles.forEach((otherCircle) => {
            if (otherCircle.id === circle.id || otherCircle.isDragging) return;

            const otherRadius =
              otherCircle.id === "auth" || otherCircle.id === "deposits"
                ? 56
                : 48;
            const minDistance = radius + otherRadius + 15;

            const dx = circle.x - otherCircle.x;
            const dy = circle.y - otherCircle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < minDistance && distance > 0) {
              const pushForce = (minDistance - distance) * 0.02;
              const angle = Math.atan2(dy, dx);

              const pushX = Math.cos(angle) * pushForce;
              const pushY = Math.sin(angle) * pushForce;

              newX = Math.max(
                radius,
                Math.min(rect.width - radius, newX + pushX),
              );
              newY = Math.max(
                radius,
                Math.min(rect.height - radius, newY + pushY),
              );

              if (Math.abs(pushX) > 0.1 || Math.abs(pushY) > 0.1) {
                hasMovement = true;
              }
            }
          });

          return { ...circle, x: newX, y: newY };
        });

        onCircleUpdate(settledCircles);

        if (hasMovement) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          setIsSettling(false);
          if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
          }
        }
      };

      animationRef.current = requestAnimationFrame(animate);
    }, 50);
  }, [circles, onCircleUpdate, containerRef]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (dragOffset) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragOffset, handleMouseMove, handleMouseUp]);

  return (
    <>
      {circles.map((circle) => (
        <div
          key={circle.id}
          className={`absolute cursor-move select-none transition-all duration-300 ease-out ${
            circle.isDragging ? "scale-110 z-10" : "hover:scale-105"
          } ${isSettling ? "transition-all duration-500 ease-out" : ""}`}
          style={{
            left:
              circle.x -
              (circle.id === "auth" || circle.id === "deposits" ? 56 : 48),
            top:
              circle.y -
              (circle.id === "auth" || circle.id === "deposits" ? 56 : 48),
          }}
          onMouseDown={(e) => handleMouseDown(e, circle.id)}
        >
          <div
            className={`${circle.id === "auth" || circle.id === "deposits" ? "w-28 h-28" : "w-24 h-24"} ${circle.color} rounded-full flex flex-col items-center justify-center text-white shadow-xl border-3 border-white/30 animate-pulse`}
            style={{
              animation: `wiggle-${circle.id.replace(/[^a-zA-Z]/g, "")} 3s ease-in-out infinite`,
            }}
          >
            <div
              className={`${circle.id === "auth" || circle.id === "deposits" ? "text-xl" : "text-lg"} font-bold leading-tight`}
            >
              {circle.value}
            </div>
            <div className="text-xs opacity-90 leading-tight text-center">
              {circle.label}
            </div>
          </div>
        </div>
      ))}
      <style>{`
        @keyframes wiggle-records {
          0%, 100% { transform: rotate(-2deg) translateY(0); }
          25% { transform: rotate(1deg) translateY(-1px); }
          50% { transform: rotate(-1deg) translateY(1px); }
          75% { transform: rotate(2deg) translateY(-1px); }
        }
        @keyframes wiggle-files {
          0%, 100% { transform: rotate(1deg) translateY(0); }
          25% { transform: rotate(-2deg) translateY(1px); }
          50% { transform: rotate(2deg) translateY(-1px); }
          75% { transform: rotate(-1deg) translateY(1px); }
        }
        @keyframes wiggle-auth {
          0%, 100% { transform: rotate(-1deg) translateY(0); }
          25% { transform: rotate(2deg) translateY(-1px); }
          50% { transform: rotate(-2deg) translateY(1px); }
          75% { transform: rotate(1deg) translateY(-1px); }
        }
        @keyframes wiggle-deposits {
          0%, 100% { transform: rotate(2deg) translateY(0); }
          25% { transform: rotate(-1deg) translateY(1px); }
          50% { transform: rotate(1deg) translateY(-1px); }
          75% { transform: rotate(-2deg) translateY(1px); }
        }
        @keyframes wiggle-tables {
          0%, 100% { transform: rotate(-2deg) translateY(0); }
          25% { transform: rotate(1deg) translateY(-1px); }
          50% { transform: rotate(-1deg) translateY(1px); }
          75% { transform: rotate(2deg) translateY(-1px); }
        }
      `}</style>
    </>
  );
}

// Helper function to parse ISO date strings without timezone shifts
// Converts "2025-10-29" to Oct 29, 2025 in local timezone (not Oct 28)
function parseISODateLocal(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed
}

function Tddf1Page() {
  // Default to today's date
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showProgressTracking, setShowProgressTracking] = useState(false);
  const [trackingUploadId, setTrackingUploadId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [filesTab, setFilesTab] = useState<string>("dataFiles");
  const [focusedMerchant, setFocusedMerchant] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Get user info for theme preferences
  const { data: user, refetch: refetchUser } = useQuery({
    queryKey: ["/api/user"],
    staleTime: 0, // Always fetch fresh user data
    refetchOnWindowFocus: true,
  });

  const isDarkMode = false; // Theme handling simplified for now

  // Force re-render when theme changes
  useEffect(() => {
    // Theme has changed - any additional logic can go here
  }, [isDarkMode]);

  // Format dates for API calls
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");

  // API Queries with enhanced refresh options
  const {
    data: stats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useQuery<Tddf1Stats>({
    queryKey: ["/api/tddf1/stats"],
    refetchInterval: 10000, // Refetch every 10 seconds
    refetchOnWindowFocus: true,
    staleTime: 5000, // Consider data fresh for 5 seconds
  });

  const {
    data: dayBreakdown,
    isLoading: dayLoading,
    refetch: refetchDayBreakdown,
  } = useQuery<Tddf1DayBreakdown>({
    queryKey: ["/api/tddf1/day-breakdown", selectedDateStr],
    queryFn: () => {
      return fetch(`/api/tddf1/day-breakdown?date=${selectedDateStr}`).then(
        (res) => res.json(),
      );
    },
    enabled: !!selectedDateStr,
  });

  // Files by date query for table view
  const { data: filesByDate, isLoading: filesLoading } = useQuery<{
    date: string;
    fileCount: number;
    files: Array<{
      uploadId: string;
      filename: string;
      uploadTime: string;
      uploadComplete: string | null;
      encodingComplete: string | null;
      fileSize: number | null;
      businessDay: string | null;
      primaryBatchDate: string | null;
      maxBatchDate: string | null;
      minTransactionDate: string | null;
      maxTransactionDate: string | null;
      scheduledSlot: string | null;
      scheduledSlotRaw: string | null;
      filenameDate: string | null;
      actualProcessTime: string | null;
      processingDelaySeconds: number | null;
      totalRecords: number;
      recordTypeCounts: Record<string, number>;
      netDeposits: number;
      transactionAmounts: number;
    }>;
    timestamp: number;
  }>({
    queryKey: ["/api/tddf1/files-by-date", selectedDateStr],
    queryFn: () => {
      return fetch(`/api/tddf1/files-by-date?date=${selectedDateStr}`).then(
        (res) => res.json(),
      );
    },
    enabled: !!selectedDateStr,
  });

  const {
    data: recentActivity,
    isLoading: activityLoading,
    refetch: refetchActivity,
  } = useQuery<Tddf1RecentActivity[]>({
    queryKey: ["/api/tddf1/recent-activity"],
  });

  // Pipeline status query - updates every 30 seconds when page is visible
  const { data: pipelineStatus, isLoading: pipelineLoading } =
    useQuery<Tddf1PipelineStatus>({
      queryKey: ["/api/tddf1/pipeline-status"],
      refetchInterval: 30000, // 30 seconds
      refetchOnWindowFocus: true,
      staleTime: 10000, // Consider data fresh for 10 seconds
    });

  // Progress tracking query (only when tracking is enabled)
  const { data: encodingProgress, isLoading: progressLoading } =
    useQuery<Tddf1EncodingProgress>({
      queryKey: ["/api/tddf1/encoding-progress", trackingUploadId],
      queryFn: () =>
        fetch(`/api/tddf1/encoding-progress/${trackingUploadId}`).then((res) =>
          res.json(),
        ),
      enabled: !!trackingUploadId && showProgressTracking,
      refetchInterval: trackingUploadId ? 2000 : false, // Poll every 2 seconds when tracking
    });

  // Draggable circles state
  const containerRef = useRef<HTMLDivElement>(null);
  const [circles, setCircles] = useState<DraggableCircle[]>([]);

  // Initialize circles when dayBreakdown data is available
  useEffect(() => {
    if (dayBreakdown && containerRef.current) {
      const newCircles: DraggableCircle[] = [
        {
          id: "records",
          x: 80,
          y: 160,
          color: "bg-gradient-to-br from-gray-400 to-gray-600",
          value: `${((dayBreakdown.totalRecords ?? 0) / 1000).toFixed(0)}k`,
          label: "Records",
          isDragging: false,
        },
        {
          id: "files",
          x: 280,
          y: 160,
          color: "bg-gradient-to-br from-slate-400 to-slate-600",
          value: `${dayBreakdown.fileCount ?? 0}`,
          label: "Files",
          isDragging: false,
        },
        {
          id: "auth",
          x: 240,
          y: 80,
          color: "bg-gradient-to-br from-blue-400 to-blue-600",
          value: formatCompactCurrency(dayBreakdown.totalTransactionValue ?? dayBreakdown.transactionValue ?? 0),
          label: "Auth",
          isDragging: false,
        },
        {
          id: "deposits",
          x: 120,
          y: 80,
          color: "bg-gradient-to-br from-green-400 to-green-600",
          value: formatCompactCurrency(dayBreakdown.netDeposits ?? 0),
          label: "Deposits",
          isDragging: false,
        },
        {
          id: "tables",
          x: 180,
          y: 200,
          color: "bg-gradient-to-br from-zinc-400 to-zinc-600",
          value: `${(dayBreakdown.tables ?? []).length}`,
          label: "Tables",
          isDragging: false,
        },
      ];
      setCircles(newCircles);
    }
  }, [dayBreakdown]);

  // Navigation functions
  const navigateToToday = () => setSelectedDate(new Date());
  const navigateToPreviousDay = () =>
    setSelectedDate((prev) => subDays(prev, 1));
  const navigateToNextDay = () => setSelectedDate((prev) => addDays(prev, 1));

  // Totals cache rebuild mutation
  const rebuildCacheMutation = useMutation({
    mutationFn: () => {
      // Extract month from selected date for the API call
      const month = format(selectedDate, "yyyy-MM");
      return fetch(`/api/tddf1/rebuild-totals-cache?month=${month}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to rebuild cache");
        return res.json();
      });
    },
    onSuccess: () => {
      const month = format(selectedDate, "MMMM yyyy");
      toast({
        title: "Cache Rebuilt",
        description: `TDDF1 totals cache for ${month} has been successfully rebuilt with fresh data`,
      });
      // Refresh all queries to get fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/tddf1/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tddf1/day-breakdown"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/tddf1/recent-activity"],
      });
    },
    onError: (error: any) => {
      toast({
        title: "Cache Rebuild Failed",
        description: error.message || "Failed to rebuild TDDF1 totals cache",
        variant: "destructive",
      });
    },
  });

  // Progress tracking functions
  const startProgressTracking = (uploadId: string) => {
    setTrackingUploadId(uploadId);
    setShowProgressTracking(true);
    toast({
      title: "Progress Tracking Started",
      description: `Now tracking encoding progress for ${uploadId}`,
    });
  };

  const stopProgressTracking = () => {
    setShowProgressTracking(false);
    setTrackingUploadId(null);
  };

  // Theme toggle mutation
  const updateThemeMutation = useMutation({
    mutationFn: (newTheme: "light" | "dark") =>
      apiRequest("/api/user/preferences", {
        method: "PATCH",
        body: JSON.stringify({ themePreference: newTheme }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: async () => {
      // Wait a moment for database update to propagate
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Force refetch user data with fresh settings
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      await refetchUser(); // Wait for refetch to complete
      // Force one more refresh to ensure theme changes
      setTimeout(() => {
        refetchUser();
      }, 200);

      toast({
        title: "Theme Updated",
        description: "Your theme preference has been saved",
        duration: 2000, // Auto-dismiss after 2 seconds
      });
    },
    onError: (error: any) => {
      console.error("Theme update error:", error);
      toast({
        title: "Update Failed",
        description: "Failed to update theme preference",
        variant: "destructive",
        duration: 3000,
      });
    },
  });

  const handleThemeToggle = () => {
    const newTheme = isDarkMode ? "light" : "dark";
    console.log(
      "Toggle clicked! Current isDarkMode:",
      isDarkMode,
      "New theme:",
      newTheme,
      "User:",
      user,
    );
    updateThemeMutation.mutate(newTheme);
  };

  // Auto-stop tracking when encoding completes
  useEffect(() => {
    if (encodingProgress?.status === "completed") {
      setTimeout(() => {
        stopProgressTracking();
        toast({
          title: "Encoding Complete!",
          description: `File ${encodingProgress.filename} has finished encoding with ${encodingProgress.currentRecords} records`,
        });
      }, 3000); // Show completion for 3 seconds before auto-stopping
    }
  }, [encodingProgress?.status]);

  return (
    <div
      className={`min-h-screen transition-colors p-2 sm:p-4 ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
    >
      <div className="max-w-7xl mx-auto space-y-2 sm:space-y-4">
        {/* Compact Header */}
        <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              onClick={() => setLocation("/")}
              variant="outline"
              size="sm"
              className="flex items-center gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back</span>
            </Button>
            <div>
              <h1
                className={`text-lg sm:text-2xl font-bold transition-colors ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}
              >
                TDDF1 Dashboard
              </h1>
              <p
                className={`text-xs sm:text-sm hidden sm:block transition-colors ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
              >
                File-based TDDF processing with day-level analytics
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            <Button
              onClick={() => setLocation("/tddf1-monthly")}
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none"
            >
              <CalendarIcon className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Monthly View</span>
              <span className="sm:hidden">Monthly</span>
            </Button>
            <Button
              onClick={navigateToToday}
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none"
            >
              <CalendarIcon className="h-4 w-4 mr-1 sm:mr-2" />
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleThemeToggle}
              className="flex items-center gap-1 sm:gap-2"
              disabled={updateThemeMutation.isPending}
            >
              {isDarkMode ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {isDarkMode ? "Light" : "Dark"}
              </span>
            </Button>
          </div>
        </div>

        {/* Processing Date Selection - Moved to top */}
        <Card
          className={`transition-colors ${isDarkMode ? "bg-gray-900 border-gray-600" : "bg-gray-50 border-gray-300"}`}
        >
          <CardHeader className="pb-2">
            <CardTitle
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}
            >
              <CalendarIcon className="h-4 w-4" />
              Processing Date Selection
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-center mb-3">
              <div
                className={`text-base sm:text-lg font-semibold mb-1 transition-colors ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}
              >
                <span className="hidden sm:inline">
                  <span
                    className={
                      getDay(selectedDate) === 0
                        ? "text-orange-500 font-bold"
                        : ""
                    }
                  >
                    {format(selectedDate, "EEEE")}
                  </span>
                  <span>, {format(selectedDate, "MMMM d, yyyy")}</span>
                </span>
                <span className="sm:hidden">
                  <span
                    className={
                      getDay(selectedDate) === 0
                        ? "text-orange-500 font-bold"
                        : ""
                    }
                  >
                    {format(selectedDate, "EEE")}
                  </span>
                  <span> {format(selectedDate, "MMM d, yyyy")}</span>
                </span>
              </div>
              <div
                className={`text-xs mb-3 transition-colors ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
              >
                {dayBreakdown ? (
                  <>
                    <span className="hidden sm:inline">
                      {(dayBreakdown.totalRecords || 0).toLocaleString()}{" "}
                      records • {dayBreakdown.fileCount || 0} files
                    </span>
                    <span className="sm:hidden">
                      {((dayBreakdown.totalRecords || 0) / 1000).toFixed(0)}k
                      records • {dayBreakdown.fileCount || 0} files
                    </span>
                  </>
                ) : (
                  "No data"
                )}
                {(() => {
                  const nonProcessingInfo = isNonProcessingDay(selectedDate);
                  const holiday = isFederalHoliday(selectedDate);

                  if (nonProcessingInfo.isNonProcessing) {
                    return (
                      <div className="mt-1">
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            holiday
                              ? "border-red-300 bg-red-50 text-red-700"
                              : "border-orange-300 bg-orange-50 text-orange-700"
                          }`}
                        >
                          {holiday
                            ? `🏛️ ${holiday.name}`
                            : `🚫 ${nonProcessingInfo.reason}`}
                        </Badge>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>

            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                onClick={navigateToPreviousDay}
                className="flex items-center gap-1"
                size="sm"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Previous</span>
                <span className="sm:hidden">Prev</span>
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex items-center gap-1 min-w-[100px] justify-center"
                    size="sm"
                  >
                    <CalendarIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">Select Date</span>
                    <span className="sm:hidden">Date</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDate(date);
                      }
                    }}
                    disabled={(date) =>
                      date > new Date() || date < new Date("1900-01-01")
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <Button
                variant="outline"
                onClick={navigateToNextDay}
                className="flex items-center gap-1"
                size="sm"
                disabled={isToday(selectedDate)}
              >
                <span className="hidden sm:inline">Next</span>
                <span className="sm:hidden">Next</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Daily Overview
            </TabsTrigger>
            <TabsTrigger value="table" className="flex items-center gap-2">
              <TableIcon className="h-4 w-4" />
              Table View
            </TabsTrigger>
            <TabsTrigger value="merchants" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Merchant Volume
            </TabsTrigger>
          </TabsList>

          {/* Toolbox - Visible on All Tabs */}
          <Card
            className={`shadow-lg border-2 transition-colors ${isDarkMode ? "bg-gray-800 border-gray-600" : "bg-white border-gray-300"}`}
          >
            <CardHeader className="pb-2">
              <CardTitle
                className={`text-center text-sm font-medium transition-colors ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}
              >
                🧰 Toolbox
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-4">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchStats()}
                  disabled={statsLoading}
                  className="flex items-center gap-1"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${statsLoading ? "animate-spin" : ""}`}
                  />
                  <span className="hidden sm:inline">Refresh Data</span>
                  <span className="sm:hidden">Refresh</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => rebuildCacheMutation.mutate()}
                  disabled={rebuildCacheMutation.isPending}
                  className="flex items-center gap-1"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${rebuildCacheMutation.isPending ? "animate-spin" : ""}`}
                  />
                  <span className="hidden sm:inline">
                    Rebuild TDDF1 Totals Cache
                  </span>
                  <span className="sm:hidden">Rebuild Cache</span>
                </Button>
                {!showProgressTracking && (
                  <Button
                    onClick={() =>
                      startProgressTracking("uploader_1754109681308_4m2wdlwnj")
                    }
                    variant="default"
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1"
                  >
                    <Activity className="h-4 w-4 animate-pulse" />
                    <span className="hidden sm:inline">
                      Track Live Encoding
                    </span>
                    <span className="sm:hidden">Track</span>
                  </Button>
                )}
              </div>

              {rebuildCacheMutation.isPending && (
                <div
                  className={`text-center mt-2 p-2 rounded-md transition-colors ${isDarkMode ? "bg-blue-900/30 text-blue-300" : "bg-blue-50 text-blue-800"}`}
                >
                  <div className="text-xs">
                    Rebuilding TDDF1 totals cache... This may take a few
                    moments.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Overview Tab Content */}
          <TabsContent value="overview" className="space-y-2 sm:space-y-4">
            {/* Focused Merchant Indicator */}
            {focusedMerchant && (
              <Card
                className={`border-2 border-blue-500 transition-colors ${isDarkMode ? "bg-blue-900/20 border-blue-400" : "bg-blue-50 border-blue-300"}`}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-blue-600" />
                      <span
                        className={`text-sm font-medium ${isDarkMode ? "text-blue-300" : "text-blue-700"}`}
                      >
                        Focused on: {focusedMerchant.name}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-xs ${isDarkMode ? "border-blue-400 text-blue-300" : "border-blue-500 text-blue-600"}`}
                      >
                        ID: {focusedMerchant.id.slice(-8)}
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setFocusedMerchant(null)}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Main Financial Metrics */}
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              <Card
                className={`transition-colors ${isDarkMode ? "bg-gray-900 border-gray-600" : "bg-gray-50 border-gray-300"}`}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 p-2">
                  <CardTitle
                    className={`text-xs sm:text-sm font-medium transition-colors ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}
                  >
                    Authorizations
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent className="pt-0 p-2">
                  <div
                    className={`text-xl sm:text-2xl font-bold transition-colors ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    {dayLoading
                      ? "..."
                      : formatCompactCurrency(dayBreakdown?.totalTransactionValue ?? 0)}
                  </div>
                </CardContent>
              </Card>

              <Card
                className={`transition-colors ${isDarkMode ? "bg-gray-900 border-gray-600" : "bg-gray-50 border-gray-300"}`}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 p-2">
                  <CardTitle
                    className={`text-xs sm:text-sm font-medium transition-colors ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}
                  >
                    Net Deposits for day
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent className="pt-0 p-2">
                  <div
                    className={`text-xl sm:text-2xl font-bold transition-colors ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    {dayLoading
                      ? "..."
                      : formatCompactCurrency(dayBreakdown?.netDeposits ?? 0)}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Mobile-Optimized Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Mobile-Optimized Day Breakdown Widget */}
              <Card
                className={`lg:col-span-2 transition-colors ${isDarkMode ? "bg-gray-900 border-gray-600" : "bg-gray-50 border-gray-300"}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle
                      className={`flex items-center gap-2 text-sm font-medium transition-colors ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}
                    >
                      <BarChart3 className="h-4 w-4" />
                      <span className="hidden sm:inline">
                        Daily - {format(selectedDate, "MMM d")}
                      </span>
                      <span className="sm:hidden">
                        Daily - {format(selectedDate, "MMM d")}
                      </span>
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetchDayBreakdown()}
                      disabled={dayLoading}
                      className="flex items-center gap-1"
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${dayLoading ? "animate-spin" : ""}`}
                      />
                      <span className="text-xs">Refresh</span>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {dayLoading ? (
                    <div className="text-center py-4 text-gray-500 text-sm">
                      Loading day data...
                    </div>
                  ) : dayBreakdown ? (
                    <div className="space-y-4">
                      {/* Interactive Draggable Circles */}
                      <div
                        ref={containerRef}
                        className="relative h-80 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden"
                        style={{ touchAction: "none" }}
                      >
                        <div className="absolute top-2 left-2 text-xs text-gray-500 dark:text-gray-400">
                          Drag the circles around!
                        </div>
                        {circles.length > 0 && (
                          <DraggableCircles
                            circles={circles}
                            onCircleUpdate={setCircles}
                            containerRef={containerRef}
                          />
                        )}
                      </div>

                      {/* Mobile-Optimized Record Type Breakdown */}
                      <div>
                        <h4
                          className={`font-semibold mb-3 text-sm sm:text-base transition-colors ${isDarkMode ? "text-gray-200" : "text-gray-900"}`}
                        >
                          Record Types
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                          {(() => {
                            // Define consistent order and colors for record types
                            const recordTypeConfig = {
                              BH: {
                                color:
                                  "bg-blue-100 text-blue-800 border-blue-200",
                                label: "BH",
                                description: "Batch Header",
                              },
                              DT: {
                                color:
                                  "bg-green-100 text-green-800 border-green-200",
                                label: "DT",
                                description: "Detail Transaction",
                              },
                              G2: {
                                color:
                                  "bg-purple-100 text-purple-800 border-purple-200",
                                label: "G2",
                                description: "Geographic Data",
                              },
                              E1: {
                                color:
                                  "bg-orange-100 text-orange-800 border-orange-200",
                                label: "E1",
                                description: "Extension 1",
                              },
                              P1: {
                                color:
                                  "bg-cyan-100 text-cyan-800 border-cyan-200",
                                label: "P1",
                                description: "Purchasing Card 1",
                              },
                              P2: {
                                color:
                                  "bg-pink-100 text-pink-800 border-pink-200",
                                label: "P2",
                                description: "Purchasing Card 2",
                              },
                              DR: {
                                color: "bg-red-100 text-red-800 border-red-200",
                                label: "DR",
                                description: "Detail Reversal",
                              },
                              AD: {
                                color:
                                  "bg-indigo-100 text-indigo-800 border-indigo-200",
                                label: "AD",
                                description: "Adjustment",
                              },
                              UNK: {
                                color:
                                  "bg-gray-100 text-gray-800 border-gray-200",
                                label: "UNK",
                                description: "Unknown",
                              },
                            };

                            const orderedTypes = Object.keys(recordTypeConfig);
                            return orderedTypes
                              .filter(
                                (type) =>
                                  (dayBreakdown.recordTypes ?? {})[type],
                              )
                              .map((type) => {
                                const count = (dayBreakdown.recordTypes ?? {})[
                                  type
                                ];
                                const config =
                                  recordTypeConfig[
                                    type as keyof typeof recordTypeConfig
                                  ];
                                const displayCount =
                                  typeof count === "number"
                                    ? count
                                    : typeof count === "object" &&
                                        count !== null &&
                                        "count" in count
                                      ? (count as any).count
                                      : count;

                                // Special layout for BH records showing Net Deposit prominently
                                if (type === "BH") {
                                  // Use new specific fields if available, fallback to old fields
                                  const batchCount =
                                    dayBreakdown.batchCount ??
                                    displayCount ??
                                    0;
                                  const netDepositAmount =
                                    dayBreakdown.batchTotal ??
                                    dayBreakdown.netDeposits ??
                                    dayBreakdown.totalNetDepositBH ??
                                    0;

                                  return (
                                    <div
                                      key={type}
                                      className={`rounded-lg p-3 border ${config.color}`}
                                    >
                                      <div className="flex items-center justify-between mb-2">
                                        <div>
                                          <span className="text-sm font-bold">
                                            {config.label}
                                          </span>
                                          <div className="text-xs opacity-80">
                                            Batch Headers (Net Deposits)
                                          </div>
                                        </div>
                                        <div className="text-sm font-medium text-blue-700">
                                          {batchCount.toLocaleString()} batches
                                        </div>
                                      </div>
                                      <div className="text-center">
                                        <div className="text-2xl font-bold text-blue-800">
                                          $
                                          {(
                                            netDepositAmount ?? 0
                                          ).toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                          })}
                                        </div>
                                        <div className="text-xs font-medium text-blue-600">
                                          Net Deposit Total
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }

                                // Special layout for DT records showing Transaction Amount prominently
                                if (type === "DT") {
                                  // Use new specific fields if available, fallback to old fields
                                  const authCount =
                                    dayBreakdown.authorizationCount ??
                                    displayCount ??
                                    0;
                                  const transactionAmount =
                                    dayBreakdown.authorizationTotal ??
                                    dayBreakdown.totalTransactionValue ??
                                    dayBreakdown.transactionValue ??
                                    0;

                                  return (
                                    <div
                                      key={type}
                                      className={`rounded-lg p-3 border ${config.color}`}
                                    >
                                      <div className="flex items-center justify-between mb-2">
                                        <div>
                                          <span className="text-sm font-bold">
                                            {config.label}
                                          </span>
                                          <div className="text-xs opacity-80">
                                            Authorization Transactions
                                          </div>
                                        </div>
                                        <div className="text-sm font-medium text-green-700">
                                          {authCount.toLocaleString()}{" "}
                                          authorizations
                                        </div>
                                      </div>
                                      <div className="text-center">
                                        <div className="text-2xl font-bold text-green-800">
                                          $
                                          {(
                                            transactionAmount ?? 0
                                          ).toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                          })}
                                        </div>
                                        <div className="text-xs font-medium text-green-600">
                                          Authorization Total
                                        </div>
                                      </div>
                                    </div>
                                  );
                                }

                                // Standard layout for other record types
                                return (
                                  <div
                                    key={type}
                                    className={`flex items-center justify-between rounded-lg p-3 border ${config.color}`}
                                  >
                                    <div>
                                      <span className="text-sm font-bold">
                                        {config.label}
                                      </span>
                                      <div className="text-xs opacity-80">
                                        {config.description}
                                      </div>
                                    </div>
                                    <div className="text-lg font-bold">
                                      {(displayCount ?? 0).toLocaleString()}
                                    </div>
                                  </div>
                                );
                              });
                          })()}
                        </div>
                      </div>

                      {/* Files Processed on This Day */}
                      {dayBreakdown.filesProcessed &&
                        dayBreakdown.filesProcessed.length > 0 && (
                          <div>
                            <h4
                              className={`font-semibold mb-3 transition-colors ${isDarkMode ? "text-gray-200" : "text-gray-900"}`}
                            >
                              Files Processed (
                              {(dayBreakdown.filesProcessed ?? []).length})
                            </h4>
                            <div className="space-y-2">
                              {dayBreakdown.filesProcessed.map(
                                (file, index) => (
                                  <div
                                    key={index}
                                    className={`rounded-lg p-3 border transition-colors ${isDarkMode ? "bg-blue-900/20 border-blue-700" : "bg-blue-50 border-blue-200"}`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex-1">
                                        <div
                                          className={`font-medium transition-colors ${isDarkMode ? "text-blue-200" : "text-blue-900"}`}
                                        >
                                          {file.fileName}
                                        </div>
                                        <div
                                          className={`text-sm transition-colors ${isDarkMode ? "text-blue-300" : "text-blue-700"}`}
                                        >
                                          {file.fileSize && (
                                            <div className="text-xs mt-1 opacity-90">
                                              File Size: {file.fileSize}
                                            </div>
                                          )}
                                          {file.processingTime && (
                                            <div className="text-xs mt-1 opacity-90">
                                              Duration: {file.processingTime}s
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <Badge
                                        variant="outline"
                                        className="text-xs"
                                      >
                                        {file.tableName.replace(
                                          "dev_tddf1_",
                                          "",
                                        )}
                                      </Badge>
                                    </div>
                                  </div>
                                ),
                              )}
                            </div>
                          </div>
                        )}

                      {/* Active Tables (fallback) */}
                      {(!dayBreakdown.filesProcessed ||
                        dayBreakdown.filesProcessed.length === 0) &&
                        (dayBreakdown.tables ?? []).length > 0 && (
                          <div>
                            <h4
                              className={`font-semibold mb-3 transition-colors ${isDarkMode ? "text-gray-200" : "text-gray-900"}`}
                            >
                              Active Tables
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {(dayBreakdown.tables ?? []).map((table) => (
                                <Badge key={table} variant="outline">
                                  {table}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  ) : (
                    <div
                      className={`text-center py-8 transition-colors ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                    >
                      No data available for{" "}
                      {format(selectedDate, "MMM d, yyyy")}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Progress Tracking Widget */}
              {showProgressTracking && encodingProgress && (
                <Card className="border-2 border-blue-200 bg-blue-50/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5 text-blue-600 animate-pulse" />
                        Live Encoding Progress
                      </CardTitle>
                      <Button
                        onClick={stopProgressTracking}
                        variant="outline"
                        size="sm"
                      >
                        Stop
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm truncate">
                            {encodingProgress.filename}
                          </span>
                          <Badge
                            variant={
                              encodingProgress.status === "completed"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {encodingProgress.status}
                          </Badge>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-1000"
                            style={{ width: `${encodingProgress.progress}%` }}
                          />
                        </div>

                        <div className="text-xs text-gray-600">
                          {encodingProgress.currentRecords.toLocaleString()} /{" "}
                          {encodingProgress.estimatedTotal.toLocaleString()}{" "}
                          records ({encodingProgress.progress}%)
                        </div>
                      </div>

                      {/* Record Type Breakdown */}
                      {Object.keys(encodingProgress.recordBreakdown).length >
                        0 && (
                        <div className="grid grid-cols-2 gap-1">
                          {Object.entries(encodingProgress.recordBreakdown).map(
                            ([type, count]) => (
                              <div
                                key={type}
                                className="flex justify-between bg-white/70 px-2 py-1 rounded text-xs"
                              >
                                <span>{type}:</span>
                                <span>{count.toLocaleString()}</span>
                              </div>
                            ),
                          )}
                        </div>
                      )}

                      <div className="text-xs text-gray-500">
                        Updated:{" "}
                        {format(
                          new Date(encodingProgress.lastUpdated),
                          "HH:mm:ss",
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recent Activity Widget */}
              <Card
                className={`transition-colors ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle
                      className={`flex items-center gap-2 transition-colors ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}
                    >
                      <Activity className="h-5 w-5" />
                      Recent Activity
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetchActivity()}
                      disabled={activityLoading}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${activityLoading ? "animate-spin" : ""}`}
                      />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {activityLoading ? (
                    <div
                      className={`text-center py-4 transition-colors ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                    >
                      Loading...
                    </div>
                  ) : recentActivity && recentActivity.length > 0 ? (
                    <div className="space-y-3">
                      {recentActivity.slice(0, 10).map((activity) => (
                        <div
                          key={activity.id}
                          className={`border-l-2 border-blue-200 pl-3 py-2 transition-colors ${isDarkMode ? "border-blue-400" : "border-blue-200"}`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`font-medium text-sm truncate transition-colors ${isDarkMode ? "text-gray-200" : "text-gray-900"}`}
                            >
                              {activity.fileName}
                            </span>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  activity.status === "completed"
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {activity.status}
                              </Badge>
                              {activity.status === "encoding" && (
                                <Button
                                  onClick={() =>
                                    startProgressTracking(activity.id)
                                  }
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-6 px-2"
                                >
                                  Track
                                </Button>
                              )}
                            </div>
                          </div>
                          <div
                            className={`text-xs mt-1 transition-colors ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
                          >
                            {activity.recordCount} records •{" "}
                            {activity.tableName}
                          </div>
                          <div
                            className={`text-xs transition-colors ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                          >
                            {format(
                              new Date(activity.processedAt),
                              "MMM d, h:mm a",
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      className={`text-center py-4 transition-colors ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                    >
                      No recent activity
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Enhanced Record Type Breakdown Widget */}
            <Card
              className={`transition-colors ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}
            >
              <CardHeader>
                <CardTitle
                  className={`flex items-center gap-2 transition-colors ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}
                >
                  <TrendingUp className="h-5 w-5" />
                  Overall Record Type Breakdown
                </CardTitle>
                {stats?.fileName && (
                  <p
                    className={`text-sm mt-1 transition-colors ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
                  >
                    Latest File: {stats.fileName} •
                    {stats.processingDurationMs &&
                      ` Processed in ${(stats.processingDurationMs / 1000).toFixed(2)}s`}
                    {stats.validationSummary?.validation_passed &&
                      ` • ${stats.validationSummary.validation_passed} validated`}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <div
                    className={`text-center py-4 transition-colors ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                  >
                    Loading...
                  </div>
                ) : stats?.recordTypeBreakdown ? (
                  <div className="space-y-6">
                    {/* Record Type Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {(() => {
                        // Define consistent order and colors for record types
                        const recordTypeConfig = {
                          BH: {
                            color: "bg-blue-100 text-blue-800 border-blue-200",
                            bgColor: "bg-blue-50",
                            textColor: "text-blue-600",
                            label: "BH",
                            description: "Batch Header",
                          },
                          DT: {
                            color:
                              "bg-green-100 text-green-800 border-green-200",
                            bgColor: "bg-green-50",
                            textColor: "text-green-600",
                            label: "DT",
                            description: "Detail Transaction",
                          },
                          G2: {
                            color:
                              "bg-purple-100 text-purple-800 border-purple-200",
                            bgColor: "bg-purple-50",
                            textColor: "text-purple-600",
                            label: "G2",
                            description: "Geographic Data",
                          },
                          E1: {
                            color:
                              "bg-orange-100 text-orange-800 border-orange-200",
                            bgColor: "bg-orange-50",
                            textColor: "text-orange-600",
                            label: "E1",
                            description: "Extension 1",
                          },
                          P1: {
                            color: "bg-cyan-100 text-cyan-800 border-cyan-200",
                            bgColor: "bg-cyan-50",
                            textColor: "text-cyan-600",
                            label: "P1",
                            description: "Purchasing Card 1",
                          },
                          P2: {
                            color: "bg-pink-100 text-pink-800 border-pink-200",
                            bgColor: "bg-pink-50",
                            textColor: "text-pink-600",
                            label: "P2",
                            description: "Purchasing Card 2",
                          },
                          DR: {
                            color: "bg-red-100 text-red-800 border-red-200",
                            bgColor: "bg-red-50",
                            textColor: "text-red-600",
                            label: "DR",
                            description: "Detail Reversal",
                          },
                          AD: {
                            color:
                              "bg-indigo-100 text-indigo-800 border-indigo-200",
                            bgColor: "bg-indigo-50",
                            textColor: "text-indigo-600",
                            label: "AD",
                            description: "Adjustment",
                          },
                          UNK: {
                            color: "bg-gray-100 text-gray-800 border-gray-200",
                            bgColor: "bg-gray-50",
                            textColor: "text-gray-600",
                            label: "UNK",
                            description: "Unknown",
                          },
                        };

                        const orderedTypes = Object.keys(recordTypeConfig);
                        return orderedTypes
                          .filter((type) => stats.recordTypeBreakdown[type])
                          .map((type) => {
                            const count = stats.recordTypeBreakdown[type];
                            const config =
                              recordTypeConfig[
                                type as keyof typeof recordTypeConfig
                              ];

                            return (
                              <div
                                key={type}
                                className={`text-center rounded-lg p-4 border ${config.bgColor} ${config.color.split(" ")[2]}`}
                              >
                                <div
                                  className={`text-2xl font-bold ${config.textColor}`}
                                >
                                  {count.toLocaleString()}
                                </div>
                                <div
                                  className={`text-sm font-bold transition-colors ${isDarkMode ? "text-gray-200" : "text-gray-700"}`}
                                >
                                  {config.label}
                                </div>
                                <div
                                  className={`text-xs mb-1 transition-colors ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
                                >
                                  {config.description}
                                </div>
                                <div
                                  className={`text-xs transition-colors ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                                >
                                  {(
                                    (count / (stats.totalRecords || 1)) *
                                    100
                                  ).toFixed(1)}
                                  %
                                </div>
                              </div>
                            );
                          });
                      })()}
                    </div>

                    {/* Enhanced Processing Metrics */}
                    {(stats.totalTddfLines ||
                      stats.totalJsonLinesInserted ||
                      stats.performanceMetrics) && (
                      <div className="border-t pt-4">
                        <h4
                          className={`font-semibold mb-3 transition-colors ${isDarkMode ? "text-gray-200" : "text-gray-700"}`}
                        >
                          Processing Metrics
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {stats.totalTddfLines && (
                            <div className="bg-blue-50 rounded-lg p-3">
                              <div className="text-lg font-bold text-blue-700">
                                {stats.totalTddfLines.toLocaleString()}
                              </div>
                              <div className="text-xs text-blue-600">
                                TDDF Lines Read
                              </div>
                            </div>
                          )}
                          {stats.totalJsonLinesInserted && (
                            <div className="bg-green-50 rounded-lg p-3">
                              <div className="text-lg font-bold text-green-700">
                                {stats.totalJsonLinesInserted.toLocaleString()}
                              </div>
                              <div className="text-xs text-green-600">
                                JSON Lines Inserted
                              </div>
                            </div>
                          )}
                          {stats.performanceMetrics?.records_per_second && (
                            <div className="bg-purple-50 rounded-lg p-3">
                              <div className="text-lg font-bold text-purple-700">
                                {parseFloat(
                                  stats.performanceMetrics.records_per_second,
                                ).toFixed(1)}
                              </div>
                              <div className="text-xs text-purple-600">
                                Records/Second
                              </div>
                            </div>
                          )}
                          {stats.performanceMetrics?.memory_usage_mb && (
                            <div className="bg-orange-50 rounded-lg p-3">
                              <div className="text-lg font-bold text-orange-700">
                                {parseFloat(
                                  stats.performanceMetrics.memory_usage_mb,
                                ).toFixed(1)}{" "}
                                MB
                              </div>
                              <div className="text-xs text-orange-600">
                                Memory Used
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Validation Summary */}
                    {stats.validationSummary &&
                      Object.keys(stats.validationSummary).length > 0 && (
                        <div className="border-t pt-4">
                          <h4
                            className={`font-semibold mb-3 transition-colors ${isDarkMode ? "text-gray-200" : "text-gray-700"}`}
                          >
                            Validation Results
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {stats.validationSummary.validation_passed && (
                              <div className="bg-green-50 rounded-lg p-3">
                                <div className="text-lg font-bold text-green-700">
                                  {stats.validationSummary.validation_passed.toLocaleString()}
                                </div>
                                <div className="text-xs text-green-600">
                                  Records Validated
                                </div>
                              </div>
                            )}
                            {stats.validationSummary.validation_failed !==
                              undefined && (
                              <div className="bg-red-50 rounded-lg p-3">
                                <div className="text-lg font-bold text-red-700">
                                  {stats.validationSummary.validation_failed}
                                </div>
                                <div className="text-xs text-red-600">
                                  Validation Failures
                                </div>
                              </div>
                            )}
                            {stats.validationSummary.row_by_row_validation && (
                              <div className="bg-blue-50 rounded-lg p-3">
                                <div className="text-lg font-bold text-blue-700">
                                  ✓
                                </div>
                                <div className="text-xs text-blue-600">
                                  Row-by-Row Validation
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                  </div>
                ) : (
                  <div
                    className={`text-center py-4 transition-colors ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                  >
                    No record type data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* System Totals - Global Stats */}
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              <Card
                className={`transition-colors ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
                  <CardTitle
                    className={`text-xs sm:text-sm font-medium transition-colors ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}
                  >
                    Total Files (Global System)
                  </CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="pt-0 p-3">
                  <div
                    className={`text-2xl sm:text-3xl font-bold transition-colors ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    {statsLoading
                      ? "..."
                      : (stats?.totalFiles ?? 0).toLocaleString()}
                  </div>
                </CardContent>
              </Card>

              <Card
                className={`transition-colors ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
                  <CardTitle
                    className={`text-xs sm:text-sm font-medium transition-colors ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}
                  >
                    Total Records (Global System)
                  </CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="pt-0 p-3">
                  <div
                    className={`text-2xl sm:text-3xl font-bold transition-colors ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    {statsLoading
                      ? "..."
                      : (stats?.totalRecords ?? 0).toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Compact Processing Pipeline Status - Bottom */}
            <Card
              className={`transition-colors ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}
            >
              <CardHeader className="p-3">
                <CardTitle
                  className={`flex items-center gap-2 text-sm transition-colors ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}
                >
                  <Activity className="h-4 w-4" />
                  Processing Pipeline Status
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-600">
                      {pipelineLoading
                        ? "..."
                        : (pipelineStatus?.totalFiles ?? 0)}
                    </div>
                    <div
                      className={`text-xs transition-colors ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                    >
                      Total Files
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-600">
                      {pipelineLoading
                        ? "..."
                        : (pipelineStatus?.uploadedFiles ?? 0)}
                    </div>
                    <div
                      className={`text-xs transition-colors ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                    >
                      Uploaded
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-yellow-600">
                      {pipelineLoading
                        ? "..."
                        : (pipelineStatus?.identifiedFiles ?? 0)}
                    </div>
                    <div
                      className={`text-xs transition-colors ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                    >
                      Identified
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-orange-600">
                      {pipelineLoading
                        ? "..."
                        : (pipelineStatus?.encodingFiles ?? 0)}
                    </div>
                    <div
                      className={`text-xs transition-colors ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                    >
                      Encoding
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-purple-600">
                      {pipelineLoading
                        ? "..."
                        : (pipelineStatus?.encodedFiles ?? 0)}
                    </div>
                    <div
                      className={`text-xs transition-colors ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                    >
                      Encoded
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-red-600">
                      {pipelineLoading
                        ? "..."
                        : (pipelineStatus?.failedFiles ?? 0)}
                    </div>
                    <div
                      className={`text-xs transition-colors ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                    >
                      Failed
                    </div>
                  </div>
                </div>
                {pipelineStatus?.lastActivity && (
                  <div className="mt-2 text-xs text-gray-400 text-center">
                    Last activity:{" "}
                    {format(
                      new Date(pipelineStatus.lastActivity),
                      "MMM d, yyyy h:mm a",
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Table View Tab Content */}
          <TabsContent value="table" className="space-y-2 sm:space-y-4">
            <Card
              className={`transition-colors ${isDarkMode ? "bg-gray-900 border-gray-600" : "bg-gray-50 border-gray-300"}`}
            >
              <CardHeader>
                <CardTitle
                  className={`flex items-center gap-2 transition-colors ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}
                >
                  <TableIcon className="h-5 w-5" />
                  Record Type Breakdown - {format(selectedDate, "MMM d, yyyy")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dayLoading ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    Loading data...
                  </div>
                ) : dayBreakdown ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow
                          className={
                            isDarkMode ? "border-gray-700" : "border-gray-200"
                          }
                        >
                          <TableHead
                            className={
                              isDarkMode ? "text-gray-300" : "text-gray-700"
                            }
                          >
                            Record Type
                          </TableHead>
                          <TableHead
                            className={`text-right ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
                          >
                            Count
                          </TableHead>
                          <TableHead
                            className={`text-right ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
                          >
                            Percentage
                          </TableHead>
                          <TableHead
                            className={`text-right ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
                          >
                            Amount
                          </TableHead>
                          <TableHead
                            className={
                              isDarkMode ? "text-gray-300" : "text-gray-700"
                            }
                          >
                            Description
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          const recordTypeConfig: Record<
                            string,
                            {
                              label: string;
                              description: string;
                              color: string;
                            }
                          > = {
                            BH: {
                              label: "BH",
                              description: "Batch Header",
                              color: "text-blue-600",
                            },
                            DT: {
                              label: "DT",
                              description: "Detail Transaction",
                              color: "text-green-600",
                            },
                            G2: {
                              label: "G2",
                              description: "Geographic Data",
                              color: "text-purple-600",
                            },
                            E1: {
                              label: "E1",
                              description: "Extension 1",
                              color: "text-orange-600",
                            },
                            P1: {
                              label: "P1",
                              description: "Purchasing Card 1",
                              color: "text-cyan-600",
                            },
                            P2: {
                              label: "P2",
                              description: "Purchasing Card 2",
                              color: "text-pink-600",
                            },
                            DR: {
                              label: "DR",
                              description: "Detail Reversal",
                              color: "text-red-600",
                            },
                            AD: {
                              label: "AD",
                              description: "Adjustment",
                              color: "text-indigo-600",
                            },
                          };

                          const recordTypes =
                            dayBreakdown.recordTypes ||
                            dayBreakdown.recordTypeBreakdown ||
                            {};
                          const totalRecords = dayBreakdown.totalRecords || 0;

                          return Object.keys(recordTypeConfig)
                            .filter((type) => recordTypes[type])
                            .map((type) => {
                              const count = recordTypes[type] || 0;
                              const percentage =
                                totalRecords > 0
                                  ? ((count / totalRecords) * 100).toFixed(1)
                                  : "0.0";
                              const config = recordTypeConfig[type];

                              let amount = "-";
                              if (type === "BH" && dayBreakdown.netDeposits) {
                                amount = formatCompactCurrency(dayBreakdown.netDeposits);
                              } else if (
                                type === "DT" &&
                                dayBreakdown.totalTransactionValue
                              ) {
                                amount = formatCompactCurrency(dayBreakdown.totalTransactionValue);
                              }

                              return (
                                <TableRow
                                  key={type}
                                  className={`${isDarkMode ? "border-gray-700 hover:bg-gray-800" : "border-gray-200 hover:bg-gray-50"} transition-colors`}
                                  data-testid={`row-record-type-${type}`}
                                >
                                  <TableCell className="font-medium">
                                    <Badge
                                      variant="outline"
                                      className={`${config.color} border-current`}
                                    >
                                      {config.label}
                                    </Badge>
                                  </TableCell>
                                  <TableCell
                                    className={`text-right font-mono ${isDarkMode ? "text-gray-200" : "text-gray-900"}`}
                                  >
                                    {count.toLocaleString()}
                                  </TableCell>
                                  <TableCell
                                    className={`text-right font-mono ${isDarkMode ? "text-gray-200" : "text-gray-900"}`}
                                  >
                                    {percentage}%
                                  </TableCell>
                                  <TableCell
                                    className={`text-right font-mono font-semibold ${isDarkMode ? "text-gray-200" : "text-gray-900"}`}
                                  >
                                    {amount}
                                  </TableCell>
                                  <TableCell
                                    className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
                                  >
                                    {config.description}
                                  </TableCell>
                                </TableRow>
                              );
                            });
                        })()}
                        <TableRow
                          className={`border-t-2 font-bold ${isDarkMode ? "border-gray-600 bg-gray-800" : "border-gray-300 bg-gray-100"}`}
                        >
                          <TableCell
                            className={
                              isDarkMode ? "text-gray-100" : "text-gray-900"
                            }
                          >
                            TOTAL
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}
                          >
                            {dayBreakdown.totalRecords.toLocaleString()}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}
                          >
                            100.0%
                          </TableCell>
                          <TableCell
                            className={`text-right ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
                          >
                            -
                          </TableCell>
                          <TableCell
                            className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
                          >
                            {dayBreakdown.fileCount} file(s)
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    No data available for this date
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Files List Card with Tabs */}
            <Card
              className={`transition-colors ${isDarkMode ? "bg-gray-900 border-gray-600" : "bg-gray-50 border-gray-300"}`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle
                    className={`flex items-center gap-2 transition-colors ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}
                  >
                    <FileText className="h-5 w-5" />
                    Files - {format(selectedDate, "MMM d, yyyy")}
                  </CardTitle>
                  {filesByDate?.files && filesByDate.files.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const filenames = filesByDate.files.map(f => f.filename).join(',');
                        setLocation(`/tddf-api?tab=rawData&filenames=${encodeURIComponent(filenames)}`);
                      }}
                      className={isDarkMode ? "border-blue-600 text-blue-400 hover:bg-blue-900/20" : "border-blue-600 text-blue-600 hover:bg-blue-50"}
                      data-testid="analyze-raw-data-button"
                    >
                      <Database className="h-4 w-4 mr-2" />
                      Analyze in Raw Data
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <Tabs value={filesTab} onValueChange={setFilesTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="dataFiles">Data Files</TabsTrigger>
                    <TabsTrigger value="filesProcessed">Files Processed</TabsTrigger>
                  </TabsList>

                  {/* Data Files Tab - Shows files by batch date */}
                  <TabsContent value="dataFiles">
                    {filesLoading ? (
                      <div className="text-center py-8 text-gray-500 text-sm">
                        Loading files...
                      </div>
                    ) : filesByDate?.files && filesByDate.files.length > 0 ? (
                      (() => {
                        const filesWithParsedData = filesByDate.files.map(file => ({
                          ...file,
                          parsed: parseTddfFilename(file.filename)
                        }));

                        const batch0830 = filesWithParsedData.filter(f => f.parsed.scheduledSlotRaw === '830');
                        const batch2400 = filesWithParsedData.filter(f => f.parsed.scheduledSlotRaw === '2400');

                        return (
                          <div className="space-y-6">
                            {batch0830.length > 0 && (
                              <div>
                                <h3 className={`text-sm font-semibold mb-3 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                                  08:30 Batch ({batch0830.length} file{batch0830.length !== 1 ? 's' : ''})
                                </h3>
                                <div className="space-y-3">
                                  {batch0830.map((file, index) => (
                                    <div
                                      key={file.uploadId}
                                      className={`p-4 rounded-lg border transition-colors ${
                                        isDarkMode
                                          ? "bg-gray-800 border-gray-700 hover:bg-gray-750"
                                          : "bg-white border-gray-200 hover:bg-gray-50"
                                      }`}
                                      data-testid={`data-file-830-${index}`}
                                    >
                                      <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                          <div
                                            className={`font-mono text-sm font-semibold truncate ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}
                                          >
                                            {file.filename}
                                          </div>
                                          <div className="flex gap-3 mt-1 text-xs">
                                            <div className={isDarkMode ? "text-blue-400" : "text-blue-600"}>
                                              Batch: {file.parsed.scheduledSlotLabel}
                                            </div>
                                            {file.parsed.actualDateTime && (
                                              <div className={isDarkMode ? "text-gray-400" : "text-gray-600"}>
                                                Processed: {format(file.parsed.actualDateTime, "HH:mm:ss")}
                                              </div>
                                            )}
                                            {file.parsed.processingDelaySeconds !== null && (
                                              <div className={isDarkMode ? "text-gray-500" : "text-gray-500"}>
                                                Delay: {formatProcessingTime(file.parsed.processingDelaySeconds)}
                                              </div>
                                            )}
                                          </div>
                                          
                                          {/* Key Dates Display */}
                                          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                            {file.filenameDate && parseISODateLocal(file.filenameDate) && (
                                              <div className={isDarkMode ? "text-gray-400" : "text-gray-600"}>
                                                <span className="font-semibold">Filename Date:</span> {format(parseISODateLocal(file.filenameDate)!, "MMM d, yyyy")}
                                              </div>
                                            )}
                                            {file.primaryBatchDate && parseISODateLocal(file.primaryBatchDate) && (
                                              <div className={`${file.filenameDate !== file.primaryBatchDate ? (isDarkMode ? "text-yellow-400" : "text-yellow-600") : (isDarkMode ? "text-green-400" : "text-green-600")}`}>
                                                <span className="font-semibold">Batch Date:</span> {format(parseISODateLocal(file.primaryBatchDate)!, "MMM d, yyyy")}
                                                {file.maxBatchDate && file.maxBatchDate !== file.primaryBatchDate && parseISODateLocal(file.maxBatchDate) && ` - ${format(parseISODateLocal(file.maxBatchDate)!, "MMM d")}`}
                                              </div>
                                            )}
                                            {file.minTransactionDate && parseISODateLocal(file.minTransactionDate) && (
                                              <div className={isDarkMode ? "text-gray-400" : "text-gray-600"}>
                                                <span className="font-semibold">Txn Dates:</span> {format(parseISODateLocal(file.minTransactionDate)!, "MMM d, yyyy")}
                                                {file.maxTransactionDate && file.maxTransactionDate !== file.minTransactionDate && parseISODateLocal(file.maxTransactionDate) && ` - ${format(parseISODateLocal(file.maxTransactionDate)!, "MMM d")}`}
                                              </div>
                                            )}
                                          </div>
                                          
                                          {file.fileSize && (
                                            <div
                                              className={`text-xs mt-1 ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}
                                            >
                                              Size: {(file.fileSize / 1024).toFixed(1)} KB
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                          <Badge
                                            variant="outline"
                                            className={
                                              isDarkMode
                                                ? "text-blue-400 border-blue-600"
                                                : "text-blue-600 border-blue-400"
                                            }
                                          >
                                            {file.totalRecords.toLocaleString()} records
                                          </Badge>
                                          {file.transactionAmounts > 0 && (
                                            <div
                                              className={`text-xs font-mono ${isDarkMode ? "text-green-400" : "text-green-600"}`}
                                            >
                                              {formatCompactCurrency(file.transactionAmounts)}
                                            </div>
                                          )}
                                          {file.netDeposits > 0 && (
                                            <div
                                              className={`text-xs font-mono ${isDarkMode ? "text-purple-400" : "text-purple-600"}`}
                                            >
                                              Net: {formatCompactCurrency(file.netDeposits)}
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Record type breakdown */}
                                      <div className="mt-3 pt-3 border-t border-gray-600 dark:border-gray-700">
                                        <div className="flex flex-wrap gap-2">
                                          {Object.entries(file.recordTypeCounts)
                                            .filter(([_, count]) => count > 0)
                                            .map(([type, count]) => {
                                              const colors: Record<string, string> = {
                                                BH: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
                                                DT: "bg-green-500/20 text-green-600 dark:text-green-400",
                                                G2: "bg-purple-500/20 text-purple-600 dark:text-purple-400",
                                                E1: "bg-orange-500/20 text-orange-600 dark:text-orange-400",
                                                P1: "bg-cyan-500/20 text-cyan-600 dark:text-cyan-400",
                                                P2: "bg-pink-500/20 text-pink-600 dark:text-pink-400",
                                                DR: "bg-red-500/20 text-red-600 dark:text-red-400",
                                                AD: "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400",
                                              };
                                              const colorClass =
                                                colors[type] ||
                                                "bg-gray-500/20 text-gray-600";

                                              return (
                                                <span
                                                  key={type}
                                                  className={`px-2 py-1 rounded text-xs font-mono ${colorClass}`}
                                                >
                                                  {type}: {count.toLocaleString()}
                                                </span>
                                              );
                                            })}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {batch2400.length > 0 && (
                              <div>
                                <h3 className={`text-sm font-semibold mb-3 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                                  24:00 Batch ({batch2400.length} file{batch2400.length !== 1 ? 's' : ''})
                                </h3>
                                <div className="space-y-3">
                                  {batch2400.map((file, index) => (
                                    <div
                                      key={file.uploadId}
                                      className={`p-4 rounded-lg border transition-colors ${
                                        isDarkMode
                                          ? "bg-gray-800 border-gray-700 hover:bg-gray-750"
                                          : "bg-white border-gray-200 hover:bg-gray-50"
                                      }`}
                                      data-testid={`data-file-2400-${index}`}
                                    >
                                      <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                          <div
                                            className={`font-mono text-sm font-semibold truncate ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}
                                          >
                                            {file.filename}
                                          </div>
                                          <div className="flex gap-3 mt-1 text-xs">
                                            <div className={isDarkMode ? "text-blue-400" : "text-blue-600"}>
                                              Batch: {file.parsed.scheduledSlotLabel}
                                            </div>
                                            {file.parsed.actualDateTime && (
                                              <div className={isDarkMode ? "text-gray-400" : "text-gray-600"}>
                                                Processed: {format(file.parsed.actualDateTime, "HH:mm:ss")}
                                              </div>
                                            )}
                                            {file.parsed.processingDelaySeconds !== null && (
                                              <div className={isDarkMode ? "text-gray-500" : "text-gray-500"}>
                                                Delay: {formatProcessingTime(file.parsed.processingDelaySeconds)}
                                              </div>
                                            )}
                                          </div>
                                          
                                          {/* Key Dates Display */}
                                          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                            {file.filenameDate && parseISODateLocal(file.filenameDate) && (
                                              <div className={isDarkMode ? "text-gray-400" : "text-gray-600"}>
                                                <span className="font-semibold">Filename Date:</span> {format(parseISODateLocal(file.filenameDate)!, "MMM d, yyyy")}
                                              </div>
                                            )}
                                            {file.primaryBatchDate && parseISODateLocal(file.primaryBatchDate) && (
                                              <div className={`${file.filenameDate !== file.primaryBatchDate ? (isDarkMode ? "text-yellow-400" : "text-yellow-600") : (isDarkMode ? "text-green-400" : "text-green-600")}`}>
                                                <span className="font-semibold">Batch Date:</span> {format(parseISODateLocal(file.primaryBatchDate)!, "MMM d, yyyy")}
                                                {file.maxBatchDate && file.maxBatchDate !== file.primaryBatchDate && parseISODateLocal(file.maxBatchDate) && ` - ${format(parseISODateLocal(file.maxBatchDate)!, "MMM d")}`}
                                              </div>
                                            )}
                                            {file.minTransactionDate && parseISODateLocal(file.minTransactionDate) && (
                                              <div className={isDarkMode ? "text-gray-400" : "text-gray-600"}>
                                                <span className="font-semibold">Txn Dates:</span> {format(parseISODateLocal(file.minTransactionDate)!, "MMM d, yyyy")}
                                                {file.maxTransactionDate && file.maxTransactionDate !== file.minTransactionDate && parseISODateLocal(file.maxTransactionDate) && ` - ${format(parseISODateLocal(file.maxTransactionDate)!, "MMM d")}`}
                                              </div>
                                            )}
                                          </div>
                                          
                                          {file.fileSize && (
                                            <div
                                              className={`text-xs mt-1 ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}
                                            >
                                              Size: {(file.fileSize / 1024).toFixed(1)} KB
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                          <Badge
                                            variant="outline"
                                            className={
                                              isDarkMode
                                                ? "text-blue-400 border-blue-600"
                                                : "text-blue-600 border-blue-400"
                                            }
                                          >
                                            {file.totalRecords.toLocaleString()} records
                                          </Badge>
                                          {file.transactionAmounts > 0 && (
                                            <div
                                              className={`text-xs font-mono ${isDarkMode ? "text-green-400" : "text-green-600"}`}
                                            >
                                              {formatCompactCurrency(file.transactionAmounts)}
                                            </div>
                                          )}
                                          {file.netDeposits > 0 && (
                                            <div
                                              className={`text-xs font-mono ${isDarkMode ? "text-purple-400" : "text-purple-600"}`}
                                            >
                                              Net: {formatCompactCurrency(file.netDeposits)}
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Record type breakdown */}
                                      <div className="mt-3 pt-3 border-t border-gray-600 dark:border-gray-700">
                                        <div className="flex flex-wrap gap-2">
                                          {Object.entries(file.recordTypeCounts)
                                            .filter(([_, count]) => count > 0)
                                            .map(([type, count]) => {
                                              const colors: Record<string, string> = {
                                                BH: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
                                                DT: "bg-green-500/20 text-green-600 dark:text-green-400",
                                                G2: "bg-purple-500/20 text-purple-600 dark:text-purple-400",
                                                E1: "bg-orange-500/20 text-orange-600 dark:text-orange-400",
                                                P1: "bg-cyan-500/20 text-cyan-600 dark:text-cyan-400",
                                                P2: "bg-pink-500/20 text-pink-600 dark:text-pink-400",
                                                DR: "bg-red-500/20 text-red-600 dark:text-red-400",
                                                AD: "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400",
                                              };
                                              const colorClass =
                                                colors[type] ||
                                                "bg-gray-500/20 text-gray-600";

                                              return (
                                                <span
                                                  key={type}
                                                  className={`px-2 py-1 rounded text-xs font-mono ${colorClass}`}
                                                >
                                                  {type}: {count.toLocaleString()}
                                                </span>
                                              );
                                            })}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div className="text-center py-8 text-gray-500 text-sm">
                        No data files found for this date
                      </div>
                    )}
                  </TabsContent>

                  {/* Files Processed Tab - Shows files uploaded on this date */}
                  <TabsContent value="filesProcessed">
                    {filesLoading ? (
                      <div className="text-center py-8 text-gray-500 text-sm">
                        Loading files...
                      </div>
                    ) : filesByDate?.files && filesByDate.files.length > 0 ? (
                      <div className="space-y-3">
                        {filesByDate.files.map((file, index) => (
                          <div
                            key={file.uploadId}
                            className={`p-4 rounded-lg border transition-colors ${
                              isDarkMode
                                ? "bg-gray-800 border-gray-700 hover:bg-gray-750"
                                : "bg-white border-gray-200 hover:bg-gray-50"
                            }`}
                            data-testid={`file-card-${index}`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div
                                  className={`font-mono text-sm font-semibold truncate ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}
                                >
                                  {file.filename}
                                </div>
                                <div
                                  className={`text-xs mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
                                >
                                  Uploaded:{" "}
                                  {format(
                                    new Date(file.uploadTime),
                                    "MMM d, yyyy h:mm a",
                                  )}
                                </div>
                                {file.fileSize && (
                                  <div
                                    className={`text-xs mt-0.5 ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}
                                  >
                                    Size: {(file.fileSize / 1024).toFixed(1)} KB
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <Badge
                                  variant="outline"
                                  className={
                                    isDarkMode
                                      ? "text-blue-400 border-blue-600"
                                      : "text-blue-600 border-blue-400"
                                  }
                                >
                                  {file.totalRecords.toLocaleString()} records
                                </Badge>
                                {file.transactionAmounts > 0 && (
                                  <div
                                    className={`text-xs font-mono ${isDarkMode ? "text-green-400" : "text-green-600"}`}
                                  >
                                    {formatCompactCurrency(file.transactionAmounts)}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Record type breakdown for this file */}
                            <div className="mt-3 pt-3 border-t border-gray-600 dark:border-gray-700">
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(file.recordTypeCounts)
                                  .filter(([_, count]) => count > 0)
                                  .map(([type, count]) => {
                                    const colors: Record<string, string> = {
                                      BH: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
                                      DT: "bg-green-500/20 text-green-600 dark:text-green-400",
                                      G2: "bg-purple-500/20 text-purple-600 dark:text-purple-400",
                                      E1: "bg-orange-500/20 text-orange-600 dark:text-orange-400",
                                      P1: "bg-cyan-500/20 text-cyan-600 dark:text-cyan-400",
                                      P2: "bg-pink-500/20 text-pink-600 dark:text-pink-400",
                                      DR: "bg-red-500/20 text-red-600 dark:text-red-400",
                                      AD: "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400",
                                    };
                                    const colorClass =
                                      colors[type] ||
                                      "bg-gray-500/20 text-gray-600";

                                    return (
                                      <span
                                        key={type}
                                        className={`px-2 py-1 rounded text-xs font-mono ${colorClass}`}
                                      >
                                        {type}: {count.toLocaleString()}
                                      </span>
                                    );
                                  })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500 text-sm">
                        No files found for this date
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Merchant Volume Tab Content */}
          <TabsContent value="merchants" className="space-y-2 sm:space-y-4">
            <Tddf1MerchantVolumeTab
              selectedDate={selectedDate}
              isDarkMode={isDarkMode}
              onMerchantFocus={(merchantId, merchantName) => {
                setFocusedMerchant({ id: merchantId, name: merchantName });
                setActiveTab("overview"); // Switch to overview tab to show focus
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default Tddf1Page;
