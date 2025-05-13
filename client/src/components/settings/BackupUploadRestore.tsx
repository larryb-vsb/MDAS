import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload, UploadCloud, FileType, AlertCircle, CheckCircle2, Loader2, FileDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

const BackupUploadRestore = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [generatingSample, setGeneratingSample] = useState(false);
  const [samplePath, setSamplePath] = useState<string | null>(null);
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check if file is valid JSON
    if (!file.name.endsWith('.json')) {
      setUploadError("Please select a valid JSON backup file");
      return;
    }
    
    // Confirm with user before proceeding
    if (!window.confirm("Warning: This will overwrite all data in the database. Are you sure you want to proceed?")) {
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }
    
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);
    setNeedsRestart(false);
    
    // Create a simulated progress update
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 500);
    
    try {
      const formData = new FormData();
      formData.append('backupFile', file);
      
      const response = await fetch('/api/settings/backup/restore-upload', {
        method: 'POST',
        body: formData,
      });
      
      clearInterval(progressInterval);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to restore backup');
      }
      
      const result = await response.json();
      setUploadProgress(100);
      setUploadSuccess(true);
      
      if (result.needsRestart) {
        setNeedsRestart(true);
        toast({
          title: "Backup restored successfully",
          description: "The system is restarting to apply changes. Please wait a moment and refresh the page.",
          variant: "default",
        });
      } else {
        toast({
          title: "Backup restored successfully",
          description: "The database has been restored from the backup file.",
          variant: "default",
        });
      }
    } catch (error) {
      clearInterval(progressInterval);
      setUploadProgress(0);
      setUploadError(error instanceof Error ? error.message : 'Failed to restore backup');
      
      toast({
        title: "Restore failed",
        description: error instanceof Error ? error.message : 'Failed to restore backup',
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };
  
  const triggerFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Upload className="mr-2 h-5 w-5 text-primary" />
          Restore from Backup
        </CardTitle>
        <CardDescription>
          Upload a backup file to restore the database
        </CardDescription>
      </CardHeader>
      <CardContent>
        {uploadSuccess ? (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-600">Backup restored successfully</AlertTitle>
            <AlertDescription className="text-green-700">
              {needsRestart ? 
                "The system is restarting to apply changes. Please wait a moment and refresh the page." :
                "The database has been restored from the backup file."
              }
            </AlertDescription>
          </Alert>
        ) : uploadError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Restore failed</AlertTitle>
            <AlertDescription>
              {uploadError}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 border-2 border-dashed rounded-md">
            <input 
              type="file" 
              ref={fileInputRef}
              className="hidden" 
              accept=".json" 
              onChange={handleFileChange}
              disabled={uploading}
            />
            <FileType className="h-12 w-12 text-gray-400 mb-2" />
            <p className="text-sm text-gray-600 mb-2">
              Select a backup file (.json) to restore
            </p>
            <p className="text-xs text-gray-500 mb-6 text-center max-w-xs">
              Warning: This will overwrite all data in the database. Make sure you have a backup of the current data.
            </p>
            <Button 
              variant="outline" 
              onClick={triggerFileSelect}
              disabled={uploading}
            >
              <UploadCloud className="mr-2 h-4 w-4" />
              {uploading ? "Uploading..." : "Choose Backup File"}
            </Button>
          </div>
        )}
        
        {uploading && (
          <div className="mt-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Upload progress</span>
              <span>{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="w-full" />
            <p className="text-xs text-gray-500 text-center mt-2">
              Please wait while the backup is being restored...
            </p>
          </div>
        )}

        {needsRestart && (
          <div className="mt-6 flex justify-center">
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="flex items-center"
            >
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Refresh page
            </Button>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <p className="text-xs text-gray-500">
          Accepted file format: .json (Maximum size: 10MB)
        </p>
      </CardFooter>
    </Card>
  );
};

export default BackupUploadRestore;