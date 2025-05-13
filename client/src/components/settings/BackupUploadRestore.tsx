import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Upload, UploadCloud, FileType, AlertCircle, CheckCircle2, 
  Loader2, FileDown, Database, RefreshCw 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [isConverting, setIsConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState(0);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  
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
  
  const generateSampleBackup = async () => {
    try {
      setGeneratingSample(true);
      
      const response = await fetch('/api/settings/backup/generate-sample');
      
      if (!response.ok) {
        throw new Error(`Error generating sample backup: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setSamplePath(data.filePath);
        toast({
          title: "Sample backup generated",
          description: "A sample backup file has been generated and is ready for use.",
          variant: "default",
        });
      } else {
        throw new Error(data.error || "Failed to generate sample backup");
      }
    } catch (error) {
      console.error("Error generating sample backup:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate sample backup",
        variant: "destructive",
      });
    } finally {
      setGeneratingSample(false);
    }
  };
  
  const convertToDatabase = async () => {
    try {
      setIsConverting(true);
      setConvertProgress(10);
      
      // Simulate progress for better UX
      const interval = setInterval(() => {
        setConvertProgress(prev => {
          if (prev >= 90) return 90;
          return prev + Math.floor(Math.random() * 10);
        });
      }, 300);
      
      const response = await fetch('/api/settings/convert-memory-to-database', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      clearInterval(interval);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to convert memory storage to database');
      }
      
      const result = await response.json();
      setConvertProgress(100);
      
      if (result.success) {
        toast({
          title: "Conversion successful",
          description: result.message,
          variant: "default",
        });
        
        if (result.needsRestart) {
          setNeedsRestart(true);
        }
      } else {
        throw new Error(result.message || "Conversion failed");
      }
    } catch (error) {
      console.error("Error converting to database:", error);
      toast({
        title: "Conversion failed",
        description: error instanceof Error ? error.message : "Failed to convert to database",
        variant: "destructive",
      });
      setConvertProgress(0);
    } finally {
      setIsConverting(false);
      setShowConvertDialog(false);
    }
  };
  
  return (
    <>
      <AlertDialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to Database?</AlertDialogTitle>
            <AlertDialogDescription>
              This will transfer all data from the in-memory storage to a persistent database.
              <br /><br />
              <span className="font-medium text-red-600">Warning:</span> This process cannot be undone and might overwrite existing database data.
              Make sure your database connection is properly configured before proceeding.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={convertToDatabase}>
              Yes, Convert Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
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
                className="mb-2"
              >
                <UploadCloud className="mr-2 h-4 w-4" />
                {uploading ? "Uploading..." : "Choose Backup File"}
              </Button>
            </div>
          )}
          
          {!uploadSuccess && !uploadError && (
            <>
              <Separator className="my-6" />
              
              <div className="mt-4">
                <h3 className="text-sm font-medium mb-2">Don't have a backup file?</h3>
                <p className="text-xs text-gray-600 mb-4">
                  You can generate a sample backup file with default admin user to get started.
                </p>
                
                <div className="flex items-center">
                  <Button 
                    variant="secondary" 
                    size="sm"
                    onClick={generateSampleBackup}
                    disabled={generatingSample}
                    className="flex items-center"
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    {generatingSample ? "Generating..." : "Generate Sample Backup"}
                  </Button>
                  
                  {samplePath && (
                    <p className="text-xs text-green-600 ml-4">
                      Sample backup created! Use the "Choose Backup File" button above to select it.
                    </p>
                  )}
                </div>
                
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-medium mb-2">Convert to Database</h3>
                  <p className="text-xs text-gray-600 mb-4">
                    You can convert the current in-memory data directly to a database without creating a backup file first.
                  </p>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowConvertDialog(true)}
                    disabled={isConverting}
                    className="flex items-center"
                  >
                    <Database className="mr-2 h-4 w-4" />
                    {isConverting ? "Converting..." : "Convert to Database"}
                  </Button>
                  
                  {isConverting && (
                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Conversion progress</span>
                        <span>{convertProgress}%</span>
                      </div>
                      <Progress value={convertProgress} className="w-full" />
                    </div>
                  )}
                </div>
              </div>
            </>
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
    </>
  );
};

export default BackupUploadRestore;