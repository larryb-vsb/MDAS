import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format, parseISO, addDays, subDays } from "date-fns";
import { 
  Activity, 
  Database, 
  FileText, 
  BarChart3, 
  Upload, 
  Trash2, 
  Download,
  Play,
  RefreshCw,
  Settings,
  GripVertical,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Calendar
} from "lucide-react";

// Define widget types
type WidgetType = "stats" | "activity" | "files" | "database";

interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  isVisible: boolean;
}

// Default widget configuration
const defaultWidgets: Widget[] = [
  {
    id: "stats-widget",
    type: "stats",
    title: "Transaction Statistics",
    position: { x: 0, y: 0 },
    size: { width: 6, height: 4 },
    isVisible: true
  },
  {
    id: "activity-widget", 
    type: "activity",
    title: "Recent Activity",
    position: { x: 6, y: 0 },
    size: { width: 6, height: 4 },
    isVisible: true
  },
  {
    id: "files-widget",
    type: "files",
    title: "File Management",
    position: { x: 0, y: 4 },
    size: { width: 8, height: 4 },
    isVisible: true
  },
  {
    id: "database-widget",
    type: "database", 
    title: "Database Status",
    position: { x: 8, y: 4 },
    size: { width: 4, height: 4 },
    isVisible: true
  }
];

// Transaction Statistics Widget
function TransactionStatsWidget({ selectedDate }: { selectedDate: string }) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['/api/tddf1/stats', selectedDate],
    enabled: true
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
        <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2"></div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="text-center mb-4">
        <div className="text-lg font-semibold text-gray-700">
          {selectedDate ? format(parseISO(selectedDate), 'MMMM d, yyyy') : 'Today'}
        </div>
        <div className="text-sm text-gray-500">Daily Summary</div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">
            {stats?.totalFiles || 0}
          </div>
          <div className="text-sm text-gray-600">TDDF Files</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">
            {stats?.totalRecords || 0}
          </div>
          <div className="text-sm text-gray-600">Total Records</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600">
            {stats?.totalTables || 0}
          </div>
          <div className="text-sm text-gray-600">Active Tables</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-orange-600">
            ${(stats?.totalAmount || 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-600">Transaction Value</div>
        </div>
      </div>
      
      <Separator />
      
      <div className="space-y-3">
        <div className="text-sm font-medium text-gray-700">Record Type Breakdown</div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-blue-50 p-2 rounded text-center">
            <div className="font-bold text-blue-600">{stats?.recordTypes?.DT || 0}</div>
            <div className="text-blue-700">DT Records</div>
          </div>
          <div className="bg-green-50 p-2 rounded text-center">
            <div className="font-bold text-green-600">{stats?.recordTypes?.BH || 0}</div>
            <div className="text-green-700">BH Records</div>
          </div>
          <div className="bg-purple-50 p-2 rounded text-center">
            <div className="font-bold text-purple-600">{stats?.recordTypes?.P1 || 0}</div>
            <div className="text-purple-700">P1 Records</div>
          </div>
          <div className="bg-orange-50 p-2 rounded text-center">
            <div className="font-bold text-orange-600">{stats?.recordTypes?.P2 || 0}</div>
            <div className="text-orange-700">P2 Records</div>
          </div>
          <div className="bg-red-50 p-2 rounded text-center">
            <div className="font-bold text-red-600">{stats?.recordTypes?.E1 || 0}</div>
            <div className="text-red-700">E1 Records</div>
          </div>
          <div className="bg-gray-50 p-2 rounded text-center">
            <div className="font-bold text-gray-600">{stats?.recordTypes?.Other || 0}</div>
            <div className="text-gray-700">Other</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Recent Activity Widget
function RecentActivityWidget({ selectedDate }: { selectedDate: string }) {
  const { data: activities, isLoading } = useQuery({
    queryKey: ['/api/tddf1/recent-activity', selectedDate],
    enabled: true
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
            <div className="flex-1 space-y-1">
              <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-2 bg-gray-200 rounded animate-pulse w-3/4"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {activities?.length ? (
        activities.slice(0, 5).map((activity: any, index: number) => (
          <div key={index} className="flex items-center space-x-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              activity.type === 'encode' ? 'bg-blue-100 text-blue-600' :
              activity.type === 'create' ? 'bg-green-100 text-green-600' :
              activity.type === 'delete' ? 'bg-red-100 text-red-600' :
              'bg-gray-100 text-gray-600'
            }`}>
              {activity.type === 'encode' ? <Play className="w-4 h-4" /> :
               activity.type === 'create' ? <CheckCircle className="w-4 h-4" /> :
               activity.type === 'delete' ? <Trash2 className="w-4 h-4" /> :
               <Activity className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {activity.description}
              </div>
              <div className="text-xs text-gray-500 flex items-center">
                <Clock className="w-3 h-3 mr-1" />
                {new Date(activity.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className="text-center text-gray-500 py-4">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <div className="text-sm">No recent activity</div>
        </div>
      )}
    </div>
  );
}

// File Management Widget
function FileManagementWidget({ selectedDate }: { selectedDate: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: files, isLoading } = useQuery({
    queryKey: ['/api/uploads', selectedDate],
    enabled: true
  });

  const encodeFileMutation = useMutation({
    mutationFn: async (file: any) => {
      const response = await apiRequest(`/api/tddf1/encode-file`, {
        method: 'POST',
        body: JSON.stringify({
          fileId: file.id,
          fileName: file.originalFilename
        })
      });
      return response;
    },
    onSuccess: (result, file) => {
      toast({
        title: "Encoding Started",
        description: `File ${file.originalFilename} is being encoded to table: ${result.tableName}`
      });
      queryClient.invalidateQueries({ queryKey: ['/api/uploads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tddf1/stats'] });
    },
    onError: (error: any) => {
      toast({
        title: "Encoding Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const tddfFiles = Array.isArray(files) ? files.filter((file: any) => 
    file.fileType === 'tddf' || file.originalFilename?.includes('.TSYSO')
  ) : [];

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex-1 space-y-1">
              <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-3 bg-gray-200 rounded animate-pulse w-2/3"></div>
            </div>
            <div className="w-20 h-8 bg-gray-200 rounded animate-pulse"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="font-medium">TDDF Files ({tddfFiles.length})</h4>
        <Button size="sm" variant="outline">
          <Upload className="w-4 h-4 mr-2" />
          Upload
        </Button>
      </div>
      
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {tddfFiles.length ? (
          tddfFiles.slice(0, 8).map((file: any) => (
            <div key={file.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {file.originalFilename}
                </div>
                <div className="text-xs text-gray-500 flex items-center">
                  <FileText className="w-3 h-3 mr-1" />
                  {(file.fileSize / 1024 / 1024).toFixed(2)} MB
                  <Badge variant="outline" className="ml-2">
                    {file.processingStatus || 'uploaded'}
                  </Badge>
                </div>
              </div>
              <div className="flex space-x-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => encodeFileMutation.mutate(file)}
                  disabled={encodeFileMutation.isPending}
                >
                  {encodeFileMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </Button>
                <Button size="sm" variant="outline">
                  <Eye className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center text-gray-500 py-6">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <div className="text-sm">No TDDF files found</div>
          </div>
        )}
      </div>
    </div>
  );
}

// Database Status Widget
function DatabaseStatusWidget({ selectedDate }: { selectedDate: string }) {
  const { data: dbStatus, isLoading } = useQuery({
    queryKey: ['/api/tddf1/database-status', selectedDate],
    enabled: true
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Database className="w-5 h-5 text-blue-600" />
          <span className="font-medium">Database</span>
        </div>
        <Badge variant={dbStatus?.status === 'healthy' ? 'default' : 'destructive'}>
          {dbStatus?.status || 'Unknown'}
        </Badge>
      </div>
      
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Active Tables</span>
          <span className="font-medium">{dbStatus?.activeTables || 0}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Total Records</span>
          <span className="font-medium">{(dbStatus?.totalRecords || 0).toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Storage Used</span>
          <span className="font-medium">{dbStatus?.storageUsed || 'N/A'}</span>
        </div>
      </div>
      
      <Separator />
      
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          {dbStatus?.status === 'healthy' ? (
            <CheckCircle className="w-4 h-4 text-green-600" />
          ) : dbStatus?.status === 'warning' ? (
            <AlertCircle className="w-4 h-4 text-yellow-600" />
          ) : (
            <XCircle className="w-4 h-4 text-red-600" />
          )}
          <span className="text-xs text-gray-600">
            Last checked: {dbStatus?.lastChecked ? new Date(dbStatus.lastChecked).toLocaleTimeString() : 'Unknown'}
          </span>
        </div>
      </div>
    </div>
  );
}

// Widget renderer
function renderWidget(widget: Widget, selectedDate: string) {
  const content = () => {
    switch (widget.type) {
      case "stats":
        return <TransactionStatsWidget selectedDate={selectedDate} />;
      case "activity":
        return <RecentActivityWidget selectedDate={selectedDate} />;
      case "files":
        return <FileManagementWidget selectedDate={selectedDate} />;
      case "database":
        return <DatabaseStatusWidget selectedDate={selectedDate} />;
      default:
        return <div className="p-4 text-gray-500">Unknown widget type</div>;
    }
  };

  return (
    <Card 
      key={widget.id} 
      className={`
        relative transition-all duration-200 hover:shadow-lg
        ${widget.size.width >= 8 ? 'col-span-8' : widget.size.width >= 6 ? 'col-span-6' : 'col-span-4'}
        ${widget.size.height >= 4 ? 'row-span-4' : 'row-span-2'}
      `}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{widget.title}</CardTitle>
          <div className="flex items-center space-x-1">
            <Button size="sm" variant="ghost" className="p-1">
              <Settings className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" className="p-1 cursor-grab">
              <GripVertical className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {content()}
      </CardContent>
    </Card>
  );
}

// Main TDDF1 Page Component
export default function Tddf1Page() {
  const [widgets, setWidgets] = useState<Widget[]>(defaultWidgets);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const { toast } = useToast();

  // Load saved widget configuration
  useEffect(() => {
    const saved = localStorage.getItem('tddf1-widgets');
    if (saved) {
      try {
        const parsedWidgets = JSON.parse(saved);
        setWidgets(parsedWidgets);
      } catch (error) {
        console.error('Failed to load widget configuration:', error);
      }
    }
  }, []);

  // Save widget configuration
  const saveWidgets = (newWidgets: Widget[]) => {
    setWidgets(newWidgets);
    localStorage.setItem('tddf1-widgets', JSON.stringify(newWidgets));
  };

  const toggleWidget = (widgetId: string) => {
    const newWidgets = widgets.map(w => 
      w.id === widgetId ? { ...w, isVisible: !w.isVisible } : w
    );
    saveWidgets(newWidgets);
  };

  const resetWidgets = () => {
    saveWidgets(defaultWidgets);
    toast({
      title: "Layout Reset",
      description: "Widget layout has been reset to default configuration"
    });
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    try {
      const currentDate = selectedDate ? parseISO(selectedDate) : new Date();
      const newDate = direction === 'prev' 
        ? subDays(currentDate, 1) 
        : addDays(currentDate, 1);
      setSelectedDate(format(newDate, 'yyyy-MM-dd'));
    } catch (error) {
      console.error('Error navigating date:', error);
      setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
    }
  };

  const goToToday = () => {
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">TDDF1 Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Universal timestamping and file-based TDDF encoding system
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            onClick={() => setIsEditMode(!isEditMode)}
          >
            <Settings className="w-4 h-4 mr-2" />
            {isEditMode ? 'Exit Edit' : 'Edit Layout'}
          </Button>
          <Button variant="outline" onClick={resetWidgets}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset Layout
          </Button>
        </div>
      </div>

      {/* Date Navigation */}
      <Card className="border-l-4 border-l-blue-500">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Calendar className="w-5 h-5 text-blue-600" />
              <div>
                <div className="text-lg font-semibold">
                  {selectedDate ? format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy') : 'Today'}
                </div>
                <div className="text-sm text-gray-600">
                  Viewing TDDF data for selected date
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigateDate('prev')}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous Day
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={goToToday}
              >
                Today
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigateDate('next')}
              >
                Next Day
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Mode Controls */}
      {isEditMode && (
        <Card className="p-4 border-dashed border-2 border-blue-300 bg-blue-50">
          <div className="flex items-center space-x-4">
            <div className="text-sm font-medium text-blue-800">
              Edit Mode Active
            </div>
            <div className="text-sm text-blue-600">
              Toggle widget visibility:
            </div>
            <div className="flex space-x-2">
              {widgets.map(widget => (
                <Button
                  key={widget.id}
                  size="sm"
                  variant={widget.isVisible ? "default" : "outline"}
                  onClick={() => toggleWidget(widget.id)}
                >
                  {widget.title}
                </Button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Widget Grid */}
      <div className="grid grid-cols-12 gap-6 auto-rows-auto">
        {widgets.filter(w => w.isVisible).map(widget => renderWidget(widget, selectedDate))}
      </div>

      {/* Information Card */}
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader>
          <CardTitle className="text-lg">About TDDF1 System</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium mb-2">Universal Timestamping</h4>
              <p className="text-gray-600">
                Each TDDF record receives a precise timestamp with 100ms intervals 
                for perfect chronological ordering and enhanced data visualization.
              </p>
            </div>
            <div>
              <h4 className="font-medium mb-2">File-Based Tables</h4>
              <p className="text-gray-600">
                Individual tables for each TDDF file using the pattern 
                "dev_tddf1_filename" for improved organization and processing efficiency.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}