import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Info, AlertTriangle, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type VersionData = {
  versions: Array<{
    id: number;
    version: string;
    appliedAt: string;
    description: string;
    changes: Record<string, any>;
    appliedBy: string;
    script?: string | null;
  }>;
  currentVersion: {
    id: number;
    version: string;
    appliedAt: string;
    description: string;
    changes: Record<string, any>;
    appliedBy: string;
    script?: string | null;
  } | null;
  expectedVersion: string;
};

export default function SchemaVersionInfo() {
  const { toast } = useToast();
  const { data, isLoading, error, refetch } = useQuery<VersionData>({
    queryKey: ['/api/schema/versions'],
  });
  
  const updateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/schema/update', { method: 'POST' });
    },
    onSuccess: () => {
      toast({
        title: "Schema Updated",
        description: "Database schema version has been updated to the latest version.",
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "Failed to update schema version",
        variant: "destructive",
      });
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Skeleton className="h-7 w-48" />
          </CardTitle>
          <CardDescription>
            <Skeleton className="h-4 w-64" />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-300">
        <CardHeader>
          <CardTitle className="flex items-center text-red-500">
            <AlertTriangle className="mr-2 h-5 w-5" />
            Schema Version Error
          </CardTitle>
          <CardDescription>
            Unable to fetch schema version information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-500">
            {error instanceof Error ? error.message : "Unknown error occurred"}
          </p>
        </CardContent>
      </Card>
    );
  }

  const versionMatch = data?.currentVersion?.version === data?.expectedVersion;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <span className="mr-2">Database Schema Version</span>
          {versionMatch ? (
            <Badge className="bg-green-500">
              <Check className="mr-1 h-3 w-3" /> Current
            </Badge>
          ) : (
            <Badge variant="destructive">
              <AlertTriangle className="mr-1 h-3 w-3" /> Outdated
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Details about the database schema and version history
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Current Version</p>
              <p className="text-xl font-bold">
                {data?.currentVersion?.version || "No version found"}
              </p>
              <p className="text-xs text-muted-foreground">
                {data?.currentVersion?.appliedAt
                  ? new Date(data.currentVersion.appliedAt).toLocaleString()
                  : "Not recorded"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Expected Version</p>
              <p className="text-xl font-bold">{data?.expectedVersion}</p>
              {!versionMatch && data?.currentVersion && (
                <div className="flex flex-col gap-1">
                  <Badge variant="outline" className="text-amber-500 border-amber-300">
                    <Info className="mr-1 h-3 w-3" />
                    Update needed
                  </Badge>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-1"
                    onClick={() => updateMutation.mutate()}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? (
                      <>
                        <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Update to {data.expectedVersion}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {data?.currentVersion && (
            <div className="rounded-md border p-3">
              <h4 className="font-medium mb-1">Description</h4>
              <p className="text-sm mb-2">{data.currentVersion.description}</p>

              {data.currentVersion.changes && (
                <div className="mt-3">
                  <h4 className="font-medium mb-1 text-sm">Changes</h4>
                  <ul className="text-xs list-disc list-inside space-y-1">
                    {data.currentVersion.changes.tables && (
                      <li>
                        Tables: {data.currentVersion.changes.tables.join(", ")}
                      </li>
                    )}
                    {data.currentVersion.changes.added && (
                      <li>
                        Added: {data.currentVersion.changes.added.join(", ")}
                      </li>
                    )}
                    {data.currentVersion.changes.modified && (
                      <li>
                        Modified: {data.currentVersion.changes.modified.join(", ")}
                      </li>
                    )}
                    {data.currentVersion.changes.removed && (
                      <li>
                        Removed: {data.currentVersion.changes.removed.join(", ")}
                      </li>
                    )}
                  </ul>
                </div>
              )}

              <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                <span>Applied by: {data.currentVersion.appliedBy}</span>
              </div>
            </div>
          )}

          {data?.versions && data.versions.length > 1 && (
            <div className="mt-5">
              <h4 className="font-medium mb-2">Version History</h4>
              <div className="text-xs space-y-2">
                {data.versions
                  .filter(v => v.id !== data.currentVersion?.id)
                  .slice(0, 3)
                  .map(version => (
                    <div key={version.id} className="rounded-md border p-2">
                      <div className="flex justify-between">
                        <span className="font-medium">{version.version}</span>
                        <span className="text-muted-foreground">
                          {new Date(version.appliedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="mt-1">{version.description}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}