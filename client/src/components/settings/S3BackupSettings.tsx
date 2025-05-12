import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CloudOff, Database, RefreshCw, Server } from "lucide-react";

// S3 configuration schema
const s3ConfigSchema = z.object({
  enabled: z.boolean().default(false),
  region: z.string().optional(),
  bucket: z.string().optional(),
  endpoint: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  useEnvCredentials: z.boolean().default(false),
});

type S3Config = z.infer<typeof s3ConfigSchema>;

export default function S3BackupSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);

  // Fetch current S3 configuration
  const {
    data: s3Config,
    isLoading,
    isError,
    error
  } = useQuery<S3Config>({
    queryKey: ["/api/settings/s3config"],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Form definition
  const form = useForm<S3Config>({
    resolver: zodResolver(s3ConfigSchema),
    defaultValues: {
      enabled: false,
      region: "",
      bucket: "",
      endpoint: "",
      accessKeyId: "",
      secretAccessKey: "",
      useEnvCredentials: false,
    },
  });

  // Update form values when data is loaded
  useState(() => {
    if (s3Config) {
      form.reset(s3Config);
    }
  });

  // Update S3 configuration
  const updateConfigMutation = useMutation({
    mutationFn: async (config: S3Config) => {
      const response = await apiRequest(
        "POST", 
        "/api/settings/s3config", 
        config
      );
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Configuration saved",
        description: "S3 backup configuration has been updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/s3config"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to save configuration: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Test S3 connection
  const testConnectionMutation = useMutation({
    mutationFn: async (config: S3Config) => {
      const response = await apiRequest(
        "POST", 
        "/api/settings/s3config/test", 
        config
      );
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Connection successful",
          description: "Successfully connected to S3 storage.",
        });
      } else {
        toast({
          title: "Connection failed",
          description: data.error || "Failed to connect to S3 storage.",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to test connection: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Form submission handler
  const onSubmit = (values: S3Config) => {
    updateConfigMutation.mutate(values);
  };

  // Test connection handler
  const testConnection = () => {
    const values = form.getValues();
    setIsTestingConnection(true);
    testConnectionMutation.mutate(values, {
      onSettled: () => {
        setIsTestingConnection(false);
      },
    });
  };

  // Handle enabled toggle
  const handleEnabledChange = (checked: boolean) => {
    form.setValue("enabled", checked);
  };

  // Handle use env credentials toggle
  const handleUseEnvCredentialsChange = (checked: boolean) => {
    form.setValue("useEnvCredentials", checked);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Database className="mr-2 h-5 w-5 text-primary" />
          S3 Backup Storage
        </CardTitle>
        <CardDescription>
          Configure cloud backup storage using Amazon S3 or compatible services
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <RefreshCw className="animate-spin h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Loading S3 configuration...</p>
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Failed to load S3 configuration. {error?.toString()}
            </AlertDescription>
          </Alert>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>Enable S3 Backup Storage</FormLabel>
                      <FormDescription>
                        Store database backups in S3-compatible cloud storage
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={handleEnabledChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              {form.watch("enabled") && (
                <>
                  <Separator />
                  
                  {/* Use environment variables option */}
                  <FormField
                    control={form.control}
                    name="useEnvCredentials"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Use Environment Credentials</FormLabel>
                          <FormDescription>
                            Use AWS credentials from environment variables instead of explicitly providing them
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={handleUseEnvCredentialsChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="region"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>AWS Region</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="us-east-1" 
                              {...field} 
                              value={field.value || ""}
                              disabled={form.watch("useEnvCredentials")}
                              className={form.watch("useEnvCredentials") ? "bg-muted" : ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="bucket"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>S3 Bucket Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="my-backup-bucket" 
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="endpoint"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custom Endpoint (Optional)</FormLabel>
                        <FormDescription>
                          For S3-compatible services like MinIO, DigitalOcean Spaces, etc.
                        </FormDescription>
                        <FormControl>
                          <Input 
                            placeholder="https://minio.example.com" 
                            {...field}
                            value={field.value || ""} 
                            disabled={form.watch("useEnvCredentials")}
                            className={form.watch("useEnvCredentials") ? "bg-muted" : ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {!form.watch("useEnvCredentials") && (
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="accessKeyId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Access Key ID</FormLabel>
                            <FormControl>
                              <Input 
                                type="password"
                                placeholder="AWS Access Key ID" 
                                {...field}
                                value={field.value || ""} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="secretAccessKey"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Secret Access Key</FormLabel>
                            <FormControl>
                              <Input 
                                type="password"
                                placeholder="AWS Secret Access Key" 
                                {...field}
                                value={field.value || ""} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                </>
              )}
              
              {!form.watch("enabled") && (
                <div className="py-6 flex flex-col items-center justify-center text-muted-foreground">
                  <CloudOff className="h-12 w-12 mb-2 opacity-20" />
                  <p>S3 backup storage is currently disabled</p>
                  <p className="text-xs mt-1">Enable it to configure cloud backup options</p>
                </div>
              )}
              
              <div className="flex flex-col md:flex-row gap-2 pt-4">
                <Button 
                  type="submit" 
                  disabled={updateConfigMutation.isPending || isTestingConnection}
                  className="flex-1"
                >
                  {updateConfigMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Configuration"
                  )}
                </Button>
                
                {form.watch("enabled") && (
                  <Button 
                    type="button" 
                    variant="secondary" 
                    onClick={testConnection}
                    disabled={testConnectionMutation.isPending || updateConfigMutation.isPending}
                    className="flex-1"
                  >
                    {isTestingConnection ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      "Test Connection"
                    )}
                  </Button>
                )}
              </div>
              
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}