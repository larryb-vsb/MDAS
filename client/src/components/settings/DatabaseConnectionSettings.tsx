import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, Save, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface DatabaseConnection {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  url: string;
  useEnvVars?: boolean;
}

export default function DatabaseConnectionSettings() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [connection, setConnection] = useState<DatabaseConnection>({
    host: "",
    port: 5432,
    database: "",
    username: "",
    password: "",
    ssl: true,
    url: "",
    useEnvVars: true
  });

  // Fetch current connection settings
  const { 
    data: connectionSettings, 
    isLoading,
    isError,
    error,
    refetch
  } = useQuery<DatabaseConnection>({
    queryKey: ["/api/settings/connection"]
  });

  // Update connection when data is loaded
  useEffect(() => {
    if (connectionSettings) {
      setConnection(connectionSettings);
    }
  }, [connectionSettings]);

  // Update connection settings
  const updateConnectionMutation = useMutation({
    mutationFn: async (newConnection: DatabaseConnection) => {
      const response = await fetch("/api/settings/connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newConnection)
      });
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Connection settings updated",
        description: "Database connection settings have been updated. The application will restart to apply changes."
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/connection"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/database"] });
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update connection settings",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setConnection(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : (type === "number" ? parseInt(value) : value)
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateConnectionMutation.mutate(connection);
  };

  const testConnection = async () => {
    try {
      // If using environment variables, we don't need to test the connection
      if (connection.useEnvVars) {
        toast({
          title: "Using environment variables",
          description: "Connection test skipped. The application will use environment variables for database connection.",
        });
        return;
      }
      
      // Validate required fields to avoid server error
      if (!connection.url && (!connection.host || !connection.database || !connection.username)) {
        toast({
          title: "Validation error",
          description: "Please provide either a complete connection URL or the host, database and username fields.",
          variant: "destructive",
        });
        return;
      }
      
      const response = await fetch("/api/settings/connection/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(connection)
      });
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Connection successful",
          description: "Successfully connected to the database server.",
        });
      } else {
        toast({
          title: "Connection failed",
          description: result.error || "Failed to connect to the database server.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Connection test failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
  };

  // Function to mask sensitive information
  const maskString = (str: string, showLast = 0) => {
    if (!str) return "";
    if (str.length <= showLast) return str;
    return "•".repeat(str.length - showLast) + str.slice(-showLast);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Database className="mr-2 h-5 w-5 text-primary" />
          Database Connection
        </CardTitle>
        <CardDescription>
          Configure your database connection settings
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <RefreshCw className="animate-spin h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Loading connection information...</p>
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Failed to fetch connection information. {error?.toString()}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="font-medium">Connection Status:</span>
              <Badge variant="outline" className="text-primary">
                {connectionSettings && connectionSettings.host ? "Configured" : "Using Environment Variables"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Host:</span>
              <span>{connectionSettings && connectionSettings.host || "From DATABASE_URL"}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Port:</span>
              <span>{connectionSettings && connectionSettings.port || "From DATABASE_URL"}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Database:</span>
              <span>{connectionSettings && connectionSettings.database || "From DATABASE_URL"}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Username:</span>
              <span>{connectionSettings && connectionSettings.username ? maskString(connectionSettings.username) : "From DATABASE_URL"}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">SSL Enabled:</span>
              <span>{connectionSettings && connectionSettings.ssl ? "Yes" : "No"}</span>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full">
              <Database className="mr-2 h-4 w-4" />
              Configure Connection
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Database Connection Settings</DialogTitle>
              <DialogDescription>
                Update your database connection settings. The application will restart after saving.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <div className="col-span-4">
                    <div className="flex items-center space-x-2 mb-4 pb-2 border-b">
                      <Checkbox 
                        id="useEnvVars" 
                        name="useEnvVars"
                        checked={connection.useEnvVars}
                        onCheckedChange={(checked) => {
                          setConnection(prev => ({
                            ...prev,
                            useEnvVars: checked === true
                          }));
                        }}
                      />
                      <Label htmlFor="useEnvVars">Use Environment Variables</Label>
                      <div className="text-xs text-muted-foreground ml-2">
                        (Uses DATABASE_URL from environment)
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className={connection.useEnvVars ? "opacity-50 pointer-events-none" : ""}>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="host" className="text-right">
                      Host
                    </Label>
                    <Input
                      id="host"
                      name="host"
                      placeholder="localhost"
                      value={connection.host}
                      onChange={handleChange}
                      className="col-span-3"
                      disabled={connection.useEnvVars}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4 mt-2">
                    <Label htmlFor="port" className="text-right">
                      Port
                    </Label>
                    <Input
                      id="port"
                      name="port"
                      type="number"
                      placeholder="5432"
                      value={connection.port}
                      onChange={handleChange}
                      className="col-span-3"
                      disabled={connection.useEnvVars}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4 mt-2">
                    <Label htmlFor="database" className="text-right">
                      Database
                    </Label>
                    <Input
                      id="database"
                      name="database"
                      placeholder="postgres"
                      value={connection.database}
                      onChange={handleChange}
                      className="col-span-3"
                      disabled={connection.useEnvVars}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4 mt-2">
                    <Label htmlFor="username" className="text-right">
                      Username
                    </Label>
                    <Input
                      id="username"
                      name="username"
                      placeholder="postgres"
                      value={connection.username}
                      onChange={handleChange}
                      className="col-span-3"
                      disabled={connection.useEnvVars}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4 mt-2">
                    <Label htmlFor="password" className="text-right">
                      Password
                    </Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="••••••••"
                      value={connection.password}
                      onChange={handleChange}
                      className="col-span-3"
                      disabled={connection.useEnvVars}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4 mt-2">
                    <Label htmlFor="ssl" className="text-right">
                      SSL
                    </Label>
                    <div className="col-span-3 flex items-center">
                      <Checkbox 
                        id="ssl" 
                        name="ssl"
                        checked={connection.ssl}
                        onCheckedChange={(checked) => {
                          setConnection(prev => ({
                            ...prev,
                            ssl: checked === true
                          }));
                        }}
                        disabled={connection.useEnvVars}
                      />
                      <Label htmlFor="ssl" className="ml-2">Enable SSL</Label>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4 mt-2">
                    <Label htmlFor="url" className="text-right">
                      Connection URL
                    </Label>
                    <Input
                      id="url"
                      name="url"
                      placeholder="postgresql://user:password@localhost:5432/database"
                      value={connection.url}
                      onChange={handleChange}
                      className="col-span-3"
                      disabled={connection.useEnvVars}
                    />
                    <div className="col-span-4 text-xs text-muted-foreground">
                      If URL is provided, it takes precedence over individual settings.
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter className="flex space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={testConnection}
                  disabled={updateConnectionMutation.isPending}
                >
                  Test Connection
                </Button>
                <Button 
                  type="submit"
                  disabled={updateConnectionMutation.isPending}
                >
                  {updateConnectionMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}