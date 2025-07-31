import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Moon, Sun, Database, Clock, RefreshCw, Settings } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface SystemInfo {
  environment: {
    name: string;
    isProduction: boolean;
  };
}

interface CacheStatus {
  cache_key: string;
  last_updated: string;
  expires_at: string;
  build_time_ms: number;
  record_count: number;
  age_minutes: number;
  status: 'fresh' | 'stale' | 'expired';
}

export default function Dashboard3() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [selectedExpiration, setSelectedExpiration] = useState<string>("30");
  const queryClient = useQueryClient();

  // Fetch system information for environment badge
  const { data: systemInfo } = useQuery<SystemInfo>({
    queryKey: ["/api/system/info"],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Fetch dashboard cache status
  const { data: cacheStatus, isLoading: cacheLoading } = useQuery<CacheStatus>({
    queryKey: ["/api/dashboard/cache-status"],
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: 1000 * 60, // Refresh every minute
  });

  // Update cache expiration mutation
  const updateExpirationMutation = useMutation({
    mutationFn: async (expiration: string | number) => {
      const body = expiration === 'never' 
        ? { never: true }
        : { minutes: typeof expiration === 'string' ? parseInt(expiration) : expiration };
      
      return apiRequest(`/api/dashboard/cache-expiration`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: () => {
      const description = selectedExpiration === 'never' 
        ? "Cache will never expire" 
        : `Cache will now expire in ${selectedExpiration} minutes`;
      
      toast({
        title: "Cache Expiration Updated",
        description,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/cache-status"] });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update cache expiration",
        variant: "destructive",
      });
    }
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
              
              {/* Cache Status Widget */}
              <Card className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} transition-colors`}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Database className="h-4 w-4" />
                    Cache Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {cacheLoading ? (
                    <div className="text-center py-4">
                      <RefreshCw className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mt-2">Loading...</p>
                    </div>
                  ) : cacheStatus ? (
                    <>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">Cache Name:</span>
                          <Badge variant="outline" className="text-xs font-mono">
                            {cacheStatus.cache_key}
                          </Badge>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">Last Refresh:</span>
                          <div className="text-xs text-right">
                            <div>{new Date(cacheStatus.last_updated).toLocaleDateString()}</div>
                            <div className="text-muted-foreground">
                              {new Date(cacheStatus.last_updated).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">Expires:</span>
                          <div className="text-xs text-right">
                            <div>{new Date(cacheStatus.expires_at).toLocaleDateString()}</div>
                            <div className="text-muted-foreground">
                              {new Date(cacheStatus.expires_at).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">Status:</span>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${
                              cacheStatus.status === 'fresh' ? 'bg-green-50 text-green-700 border-green-200' :
                              cacheStatus.status === 'stale' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                              'bg-red-50 text-red-700 border-red-200'
                            }`}
                          >
                            <Clock className="h-3 w-3 mr-1" />
                            {cacheStatus.status}
                          </Badge>
                        </div>
                        
                        <div className="text-xs text-muted-foreground text-center pt-2 border-t">
                          Age: {cacheStatus.age_minutes}m | Records: {cacheStatus.record_count?.toLocaleString()}
                        </div>
                        
                        <div className="pt-3 border-t space-y-2">
                          <div className="flex items-center gap-2">
                            <Settings className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Cache Expiration:</span>
                          </div>
                          <div className="flex gap-2">
                            <Select value={selectedExpiration} onValueChange={setSelectedExpiration}>
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="15">15 minutes</SelectItem>
                                <SelectItem value="30">30 minutes</SelectItem>
                                <SelectItem value="60">1 hour</SelectItem>
                                <SelectItem value="120">2 hours</SelectItem>
                                <SelectItem value="240">4 hours</SelectItem>
                                <SelectItem value="480">8 hours</SelectItem>
                                <SelectItem value="never">Never expire</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => updateExpirationMutation.mutate(selectedExpiration)}
                              disabled={updateExpirationMutation.isPending}
                            >
                              {updateExpirationMutation.isPending ? (
                                <RefreshCw className="h-3 w-3 animate-spin" />
                              ) : (
                                "Set"
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground text-xs">
                      No cache data available
                    </div>
                  )}
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