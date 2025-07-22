import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Info, AlertTriangle, RefreshCw, History, Eye, GitCompare, ChevronDown, ChevronUp, Download, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const [showHistory, setShowHistory] = useState(false);
  const [selectedVersions, setSelectedVersions] = useState<[number, number] | null>(null);
  const [selectedSchemaVersion, setSelectedSchemaVersion] = useState<string>("current");
  
  const { data, isLoading, error, refetch } = useQuery<VersionData>({
    queryKey: ['/api/schema/versions'],
  });
  
  const { data: schemaVersionsList } = useQuery<{versions: Array<{version: string, storedAt: string, storedBy: string, contentSize: number, notes: string}>}>({
    queryKey: ['/api/schema/versions-list'],
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

  const importSchemaMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/schema/import', { method: 'POST' });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Schema Import Completed",
        description: data.message || "Schema content has been imported into database successfully.",
      });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Import Failed", 
        description: error instanceof Error ? error.message : "Failed to import schema content",
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
  
  const handleVersionChange = (version: string) => {
    setSelectedSchemaVersion(version);
  };
  
  const handleViewSchema = () => {
    const versionParam = selectedSchemaVersion === 'current' ? '' : `?version=${selectedSchemaVersion}`;
    window.open(`/api/schema/raw${versionParam}`, '_blank');
  };

  const formatChanges = (changes: Record<string, any>) => {
    if (!changes) return null;
    
    const sections = [];
    if (changes.added && Array.isArray(changes.added)) {
      sections.push({
        title: "Added",
        items: changes.added,
        className: "text-green-600 dark:text-green-400"
      });
    }
    if (changes.modified && Array.isArray(changes.modified)) {
      sections.push({
        title: "Modified", 
        items: changes.modified,
        className: "text-blue-600 dark:text-blue-400"
      });
    }
    if (changes.removed && Array.isArray(changes.removed)) {
      sections.push({
        title: "Removed",
        items: changes.removed,  
        className: "text-red-600 dark:text-red-400"
      });
    }
    if (changes.tables && Array.isArray(changes.tables)) {
      sections.push({
        title: "Tables Affected",
        items: changes.tables,
        className: "text-purple-600 dark:text-purple-400"
      });
    }
    
    return sections;
  };

  const renderVersionChanges = (version: any) => {
    const changesSections = formatChanges(version.changes);
    if (!changesSections || changesSections.length === 0) {
      return <p className="text-sm text-muted-foreground">No detailed changes recorded</p>;
    }

    return (
      <div className="space-y-3">
        {changesSections.map((section, idx) => (
          <div key={idx}>
            <h5 className={`text-sm font-medium mb-1 ${section.className}`}>{section.title}:</h5>
            <ul className="text-xs space-y-1 ml-3">
              {section.items.map((item: string, itemIdx: number) => (
                <li key={itemIdx} className="flex items-start">
                  <span className="mr-2 mt-1">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
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
          </div>
          <div className="flex gap-2">
            <div className="flex items-center gap-2">
              <Select value={selectedSchemaVersion} onValueChange={handleVersionChange}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Version" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Current</SelectItem>
                  {schemaVersionsList?.versions?.map((version, index) => (
                    <SelectItem key={`${version.version}-${version.storedAt}-${index}`} value={version.version}>
                      v{version.version} - {new Date(version.storedAt).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleViewSchema}
                className="flex items-center"
              >
                <Eye className="mr-1 h-3 w-3" />
                View
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => importSchemaMutation.mutate()}
              disabled={importSchemaMutation.isPending}
              className="flex items-center"
            >
              {importSchemaMutation.isPending ? (
                <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Download className="mr-1 h-3 w-3" />
              )}
              Import Schema
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center"
            >
              <History className="mr-1 h-3 w-3" />
              {showHistory ? 'Hide' : 'View'} History
              {showHistory ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
            </Button>
          </div>
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

          {data?.currentVersion && !showHistory && (
            <div className="rounded-md border p-3">
              <h4 className="font-medium mb-1">Current Version Details</h4>
              <p className="text-sm mb-2">{data.currentVersion.description}</p>
              {renderVersionChanges(data.currentVersion)}
              <div className="mt-3 flex justify-between text-xs text-muted-foreground">
                <span>Applied by: {data.currentVersion.appliedBy}</span>
              </div>
            </div>
          )}

          {/* Version History View */}
          <Collapsible open={showHistory}>
            <CollapsibleContent className="space-y-4">
              {data?.versions && data.versions.length > 0 && (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium">Complete Version History</h4>
                    <div className="flex gap-2">
                      {data.versions.length > 1 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const versions = data.versions.slice().reverse();
                            if (versions.length >= 2) {
                              setSelectedVersions([versions[1].id, versions[0].id]);
                            }
                          }}
                          className="text-xs"
                        >
                          <GitCompare className="mr-1 h-3 w-3" />
                          Compare Latest
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {data.versions
                      .slice()
                      .reverse()
                      .map((version, index) => (
                        <div
                          key={version.id}
                          className={`rounded-lg border p-4 ${
                            version.id === data.currentVersion?.id 
                              ? 'border-green-300 bg-green-50 dark:bg-green-950'
                              : 'border-gray-200'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <h5 className="font-medium text-lg">{version.version}</h5>
                              {version.id === data.currentVersion?.id && (
                                <Badge variant="outline" className="bg-green-500 text-white">
                                  <Check className="mr-1 h-3 w-3" />
                                  Current
                                </Badge>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">
                                {new Date(version.appliedAt).toLocaleDateString()}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                by {version.appliedBy}
                              </p>
                            </div>
                          </div>
                          
                          <p className="text-sm text-muted-foreground mb-3">
                            {version.description}
                          </p>

                          <div className="bg-gray-50 dark:bg-gray-900 rounded p-3">
                            {renderVersionChanges(version)}
                          </div>
                        </div>
                      ))}
                  </div>

                  {/* Version Comparison */}
                  {selectedVersions && (
                    <div className="mt-6 border-t pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="font-medium">Version Comparison</h5>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedVersions(null)}
                          className="text-xs"
                        >
                          Close Diff
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        {selectedVersions.map((versionId, idx) => {
                          const version = data.versions.find(v => v.id === versionId);
                          if (!version) return null;
                          
                          return (
                            <div key={versionId} className="border rounded p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <h6 className="font-medium">{version.version}</h6>
                                <Badge variant="outline" className={idx === 0 ? "border-blue-300" : "border-green-300"}>
                                  {idx === 0 ? "From" : "To"}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mb-2">
                                {version.description}
                              </p>
                              <div className="text-xs">
                                {renderVersionChanges(version)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CardContent>
    </Card>
  );
}