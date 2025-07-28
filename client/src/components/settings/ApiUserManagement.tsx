import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Key, Calendar, Activity, Trash2, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatTableDate } from "@/lib/date-utils";

interface ApiUser {
  id: number;
  clientName: string;
  description: string | null;
  apiKey: string;
  permissions: string[];
  isActive: boolean;
  requestCount: number;
  lastUsed: string | null;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  ipWhitelist: string[] | null;
}

interface CreateApiUserData {
  clientName: string;
  description?: string;
  permissions?: string[];
}

export function ApiUserManagement() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  const { data: apiUsers = [], isLoading } = useQuery<ApiUser[]>({
    queryKey: ["/api/api-users"],
    queryFn: async () => {
      const response = await fetch("/api/api-users");
      if (!response.ok) throw new Error("Failed to fetch API users");
      return response.json();
    },
  });

  const createApiUserMutation = useMutation({
    mutationFn: async (data: CreateApiUserData) => {
      return await apiRequest("/api/api-users", {
        method: "POST",
        body: data
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-users"] });
      setShowCreateDialog(false);
      toast({
        title: "API User Created",
        description: "New API user has been created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleActiveStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return await apiRequest(`/api/api-users/${id}`, {
        method: "PUT",
        body: { isActive }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-users"] });
      toast({
        title: "Status Updated",
        description: "API user status has been updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteApiUserMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/api-users/${id}`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-users"] });
      toast({
        title: "API User Deleted",
        description: "API user has been deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleKeyVisibility = (id: number) => {
    setVisibleKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to Clipboard",
      description: "API key has been copied to clipboard",
    });
  };

  const formatApiKey = (apiKey: string | null | undefined, isVisible: boolean) => {
    if (!apiKey) return '••••••••••••••••••••••••';
    if (isVisible) return apiKey;
    return apiKey.substring(0, 8) + '••••••••••••••••' + apiKey.slice(-4);
  };

  if (isLoading) {
    return <div>Loading API users...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API User Management
            </CardTitle>
            <CardDescription>
              Manage API users for TDDF upload integration. Generate client keys and endpoint addresses for the local TDDF uploader agent.
            </CardDescription>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create API User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New API User</DialogTitle>
                <DialogDescription>
                  Create a new API user for TDDF upload integration. This will generate a unique API key for authentication.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  createApiUserMutation.mutate({
                    clientName: formData.get("clientName") as string,
                    description: formData.get("description") as string || undefined,
                    permissions: ["tddf:upload"],
                  });
                }}
              >
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="clientName">Client Name *</Label>
                    <Input
                      id="clientName"
                      name="clientName"
                      placeholder="Local TDDF Agent"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      name="description"
                      placeholder="PowerShell-based local agent for TDDF processing and upload"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="permissions">Permissions</Label>
                    <Input
                      id="permissions"
                      name="permissions"
                      placeholder="tddf:upload"
                      defaultValue="tddf:upload"
                      readOnly
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Default permissions for TDDF file upload integration
                    </p>
                  </div>
                </div>
                <DialogFooter className="mt-6">
                  <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createApiUserMutation.isPending}>
                    {createApiUserMutation.isPending ? "Creating..." : "Create API User"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {apiUsers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No API users created yet</p>
            <p className="text-sm">Create your first API user to get started with TDDF integration</p>
          </div>
        ) : (
          <div className="space-y-4">
            {apiUsers.map((apiUser) => (
              <Card key={apiUser.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold">{apiUser.clientName}</h3>
                        <Badge variant={apiUser.isActive ? "default" : "secondary"}>
                          {apiUser.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      {apiUser.description && (
                        <p className="text-sm text-muted-foreground mb-3">{apiUser.description}</p>
                      )}
                      
                      <div className="space-y-2 text-sm">
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground">ENDPOINT URL</Label>
                          <div className="flex items-center gap-2">
                            <code className="bg-muted px-2 py-1 rounded text-xs flex-1">
                              https://your-app.replit.app/api/tddf/upload
                            </code>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyToClipboard("https://your-app.replit.app/api/tddf/upload")}
                            >
                              Copy
                            </Button>
                          </div>
                        </div>
                        
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground">API KEY</Label>
                          <div className="flex items-center gap-2">
                            <code className="bg-muted px-2 py-1 rounded text-xs flex-1 font-mono">
                              {formatApiKey(apiUser.apiKey, visibleKeys.has(apiUser.id))}
                            </code>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleKeyVisibility(apiUser.id)}
                            >
                              {visibleKeys.has(apiUser.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => apiUser.apiKey && copyToClipboard(apiUser.apiKey)}
                              disabled={!apiUser.apiKey}
                            >
                              Copy
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Activity className="h-3 w-3" />
                          {apiUser.requestCount} requests
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Created {formatTableDate(apiUser.createdAt)}
                        </div>
                        {apiUser.lastUsed && (
                          <div className="flex items-center gap-1">
                            <Activity className="h-3 w-3" />
                            Last used {formatTableDate(apiUser.lastUsed)}
                          </div>
                        )}
                        <div>
                          Created by {apiUser.createdBy}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`active-${apiUser.id}`} className="text-xs">
                          Active
                        </Label>
                        <Switch
                          id={`active-${apiUser.id}`}
                          checked={apiUser.isActive}
                          onCheckedChange={(checked) =>
                            toggleActiveStatusMutation.mutate({ id: apiUser.id, isActive: checked })
                          }
                          disabled={toggleActiveStatusMutation.isPending}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this API user?")) {
                            deleteApiUserMutation.mutate(apiUser.id);
                          }
                        }}
                        disabled={deleteApiUserMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ApiUserManagement;