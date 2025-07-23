import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Database, Activity, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PoolInfo {
  name: string;
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
  waitingClients: number;
  maxConnections: number;
}

interface PoolStats {
  pools: {
    application: PoolInfo;
    batch: PoolInfo;
    session: PoolInfo;
  };
}

interface PoolHealth {
  healthy: boolean;
  issues: string[];
}

interface PoolData extends PoolStats {
  health: PoolHealth;
  timestamp: string;
}

export function PoolStatus() {
  const [poolData, setPoolData] = useState<PoolData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchPoolData = async () => {
    try {
      setError(null);
      const response = await fetch('/api/pools/info');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      if (data.success) {
        setPoolData(data);
        setLastUpdated(new Date());
      } else {
        throw new Error(data.error || 'Failed to fetch pool data');
      }
    } catch (err) {
      console.error('Error fetching pool data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPoolData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchPoolData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getHealthStatus = (healthy: boolean, issues: string[]) => {
    if (healthy) {
      return {
        icon: <CheckCircle className="h-4 w-4 text-green-500" />,
        badge: <Badge variant="default" className="bg-green-100 text-green-800">Healthy</Badge>,
        color: "text-green-600"
      };
    } else {
      return {
        icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
        badge: <Badge variant="destructive">Issues ({issues.length})</Badge>,
        color: "text-red-600"
      };
    }
  };

  const getUtilizationColor = (active: number, max: number) => {
    const percentage = (active / max) * 100;
    if (percentage >= 90) return "text-red-600";
    if (percentage >= 75) return "text-yellow-600";
    return "text-green-600";
  };

  const formatUptime = () => {
    if (!lastUpdated) return "Never";
    const now = new Date();
    const diff = now.getTime() - lastUpdated.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ago`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Connection Pool Status
          </CardTitle>
          <CardDescription>Monitoring database connection pool health and utilization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading pool status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Connection Pool Status
            <Badge variant="destructive">Error</Badge>
          </CardTitle>
          <CardDescription>Monitoring database connection pool health and utilization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={fetchPoolData} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!poolData) return null;

  const healthStatus = getHealthStatus(poolData.health.healthy, poolData.health.issues);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Connection Pool Status
          {healthStatus.badge}
        </CardTitle>
        <CardDescription>
          Real-time monitoring of database connection pools • Last updated: {formatUptime()}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Health Status */}
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          {healthStatus.icon}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">Overall Health</span>
              <Badge variant="outline" className="text-xs">
                <Activity className="h-3 w-3 mr-1" />
                Auto-refresh 30s
              </Badge>
            </div>
            {poolData.health.issues.length > 0 && (
              <ul className="text-sm text-muted-foreground mt-1">
                {poolData.health.issues.map((issue, index) => (
                  <li key={index}>• {issue}</li>
                ))}
              </ul>
            )}
          </div>
          <Button onClick={fetchPoolData} variant="ghost" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Pool Details */}
        <div className="grid gap-4">
          {Object.entries(poolData.pools).map(([poolName, pool]) => {
            const utilizationPercentage = Math.round((pool.activeConnections / pool.maxConnections) * 100);
            const utilizationColor = getUtilizationColor(pool.activeConnections, pool.maxConnections);
            
            return (
              <div key={poolName} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium capitalize">
                    {poolName} Pool
                    <Badge variant="outline" className="ml-2 text-xs">
                      {pool.name}
                    </Badge>
                  </h4>
                  <div className={cn("text-sm font-medium", utilizationColor)}>
                    {utilizationPercentage}% utilized
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Active</div>
                    <div className={cn("font-medium", utilizationColor)}>
                      {pool.activeConnections}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Idle</div>
                    <div className="font-medium text-blue-600">
                      {pool.idleConnections}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Waiting</div>
                    <div className={cn("font-medium", pool.waitingClients > 0 ? "text-yellow-600" : "text-gray-600")}>
                      {pool.waitingClients}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Max</div>
                    <div className="font-medium">
                      {pool.maxConnections}
                    </div>
                  </div>
                </div>
                
                {/* Utilization Bar */}
                <div className="mt-3">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={cn(
                        "h-2 rounded-full transition-all duration-300",
                        utilizationPercentage >= 90 ? "bg-red-500" :
                        utilizationPercentage >= 75 ? "bg-yellow-500" : "bg-green-500"
                      )}
                      style={{ width: `${utilizationPercentage}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Performance Insights */}
        <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
          <div className="font-medium mb-1">Performance Insights:</div>
          <ul className="space-y-1">
            <li>• Application Pool: Handles API requests, user queries, and standard operations</li>
            <li>• Batch Pool: Optimized for heavy TDDF processing and bulk data operations</li>
            <li>• Session Pool: Dedicated to user authentication and session management</li>
            <li>• Waiting clients indicate potential pool exhaustion - consider scaling</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}