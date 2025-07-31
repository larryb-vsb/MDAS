import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Moon, Sun } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";

interface SystemInfo {
  environment: {
    name: string;
    isProduction: boolean;
  };
}

export default function Dashboard3() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Fetch system information for environment badge
  const { data: systemInfo } = useQuery<SystemInfo>({
    queryKey: ["/api/system/info"],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    // Apply dark mode to document root
    if (!isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <MainLayout>
      <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'dark bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
        <div className="p-6 space-y-6">
          {/* Header with Title, Environment Badge, and Dark/Light Toggle */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold tracking-tight">MMS Dashboard 3</h1>
              
              {/* Environment Badge - Settings page style */}
              <Badge 
                variant="outline" 
                className="bg-blue-50 text-blue-700 border-blue-200 font-semibold px-3 py-1"
              >
                {systemInfo?.environment?.isProduction ? 'Production' : 'Development'}
              </Badge>
            </div>

            {/* Dark/Light Mode Toggle */}
            <div className="flex items-center gap-3">
              <Sun className={`h-4 w-4 ${isDarkMode ? 'text-gray-400' : 'text-yellow-500'}`} />
              <Switch 
                checked={isDarkMode}
                onCheckedChange={toggleDarkMode}
                className="data-[state=checked]:bg-blue-600"
              />
              <Moon className={`h-4 w-4 ${isDarkMode ? 'text-blue-400' : 'text-gray-400'}`} />
            </div>
          </div>

          {/* Widget Framework Container */}
          <div className="grid gap-6">
            {/* Widget Grid - Ready for components */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              
              {/* Placeholder Widget 1 */}
              <Card className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} transition-colors`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Widget Slot 1</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    Ready for widget
                  </div>
                </CardContent>
              </Card>

              {/* Placeholder Widget 2 */}
              <Card className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} transition-colors`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Widget Slot 2</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    Ready for widget
                  </div>
                </CardContent>
              </Card>

              {/* Placeholder Widget 3 */}
              <Card className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} transition-colors`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Widget Slot 3</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    Ready for widget
                  </div>
                </CardContent>
              </Card>

              {/* Placeholder Widget 4 */}
              <Card className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} transition-colors`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Widget Slot 4</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    Ready for widget
                  </div>
                </CardContent>
              </Card>

            </div>

            {/* Full Width Widget Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Large Widget 1 */}
              <Card className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} transition-colors`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Large Widget Slot 1</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12 text-muted-foreground">
                    Ready for large widget
                  </div>
                </CardContent>
              </Card>

              {/* Large Widget 2 */}
              <Card className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} transition-colors`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Large Widget Slot 2</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12 text-muted-foreground">
                    Ready for large widget
                  </div>
                </CardContent>
              </Card>

            </div>

            {/* Extra Wide Widget */}
            <Card className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} transition-colors`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Full Width Widget Slot</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-16 text-muted-foreground">
                  Ready for full width widget (charts, tables, etc.)
                </div>
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </MainLayout>
  );
}