import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Menu, GripVertical, BarChart3, FileText, Activity, Database } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';

interface Widget {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  size: 'small' | 'medium' | 'large';
}

const Tddf1Page: React.FC = () => {
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null);
  const [widgets, setWidgets] = useState<Widget[]>([
    {
      id: 'stats',
      title: 'Transaction Statistics',
      icon: <BarChart3 className="w-4 h-4" />,
      content: (
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Total Records</span>
            <span className="font-medium">12,345</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Today's Volume</span>
            <span className="font-medium">$1,234,567</span>
          </div>
        </div>
      ),
      size: 'medium'
    },
    {
      id: 'recent',
      title: 'Recent Activity',
      icon: <Activity className="w-4 h-4" />,
      content: (
        <div className="space-y-3">
          <div className="text-sm">
            <span className="font-medium">File processed:</span> TDDF_20250802.json
          </div>
          <div className="text-sm">
            <span className="font-medium">Status:</span> <span className="text-green-600">Complete</span>
          </div>
          <div className="text-sm">
            <span className="font-medium">Records:</span> 2,847 DT transactions
          </div>
        </div>
      ),
      size: 'medium'
    },
    {
      id: 'files',
      title: 'File Management',
      icon: <FileText className="w-4 h-4" />,
      content: (
        <div className="space-y-2">
          <Button variant="outline" size="sm" className="w-full">
            Upload New File
          </Button>
          <Button variant="outline" size="sm" className="w-full">
            View Processing Queue
          </Button>
          <div className="text-xs text-muted-foreground mt-2">
            Last upload: 5 minutes ago
          </div>
        </div>
      ),
      size: 'small'
    },
    {
      id: 'database',
      title: 'Database Status',
      icon: <Database className="w-4 h-4" />,
      content: (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm">Connection: Active</span>
          </div>
          <div className="text-xs text-muted-foreground">
            82,271 records in dev_tddf_jsonb
          </div>
          <div className="text-xs text-muted-foreground">
            Cache status: Optimized
          </div>
        </div>
      ),
      size: 'small'
    }
  ]);

  const handleDragStart = (e: React.DragEvent, widgetId: string) => {
    setDraggedWidget(widgetId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (!draggedWidget) return;

    const draggedIndex = widgets.findIndex(w => w.id === draggedWidget);
    if (draggedIndex === -1 || draggedIndex === targetIndex) return;

    const newWidgets = [...widgets];
    const [draggedItem] = newWidgets.splice(draggedIndex, 1);
    newWidgets.splice(targetIndex, 0, draggedItem);

    setWidgets(newWidgets);
    setDraggedWidget(null);
  };

  const getWidgetGridClass = (size: string) => {
    switch (size) {
      case 'small':
        return 'col-span-1';
      case 'medium':
        return 'col-span-2';
      case 'large':
        return 'col-span-3';
      default:
        return 'col-span-1';
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">TDDF1 Dashboard</h1>
              <p className="text-muted-foreground">Drag and drop widgets to customize your layout</p>
            </div>
            <Button variant="outline" size="sm">
              <Menu className="w-4 h-4 mr-2" />
              Layout Options
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {widgets.map((widget, index) => (
            <Card
              key={widget.id}
              className={`${getWidgetGridClass(widget.size)} cursor-move transition-all hover:shadow-lg ${
                draggedWidget === widget.id ? 'opacity-50 scale-95' : ''
              }`}
              draggable
              onDragStart={(e) => handleDragStart(e, widget.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {widget.icon}
                    <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
                  </div>
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
                </div>
              </CardHeader>
              <CardContent>
                {widget.content}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Add Widget Button */}
        <div className="mt-6">
          <Card className="border-dashed border-2 hover:border-primary/50 transition-colors">
            <CardContent className="flex items-center justify-center py-8">
              <Button variant="ghost" className="text-muted-foreground">
                <Menu className="w-4 h-4 mr-2" />
                Add New Widget
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
};

export default Tddf1Page;