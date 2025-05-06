import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertCircle, Check, AlertTriangle, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ProcessedFile {
  id: string;
  originalFilename: string;
  fileType: string;
  uploadedAt: string;
  processed: boolean;
  processingErrors: string | null;
}

export default function FileProcessingHistory() {
  const [selectedFile, setSelectedFile] = useState<ProcessedFile | null>(null);
  const [isErrorDialogOpen, setIsErrorDialogOpen] = useState(false);

  const { data: files, isLoading } = useQuery({
    queryKey: ["/api/uploads/history"],
    refetchInterval: false,
  });

  function formatFileType(type: string) {
    switch (type) {
      case "merchant":
        return "Merchant Demographics";
      case "transaction":
        return "Transaction Data";
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  }

  function formatFileDate(dateString: string) {
    const date = new Date(dateString);
    return formatDistanceToNow(date, { addSuffix: true });
  }

  function handleViewError(file: ProcessedFile) {
    setSelectedFile(file);
    setIsErrorDialogOpen(true);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>File Processing History</CardTitle>
        <CardDescription>
          View the status of uploaded files and any processing errors
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-6 text-center text-gray-500">Loading file history...</div>
        ) : !files || files.length === 0 ? (
          <div className="py-6 text-center text-gray-500">No files have been uploaded yet</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file: ProcessedFile) => (
                <TableRow key={file.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FileText size={16} />
                      <span className="truncate max-w-[200px]">
                        {file.originalFilename}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{formatFileType(file.fileType)}</TableCell>
                  <TableCell>{formatFileDate(file.uploadedAt)}</TableCell>
                  <TableCell>
                    {file.processed ? (
                      file.processingErrors ? (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <AlertCircle size={12} />
                          Error
                        </Badge>
                      ) : (
                        <Badge variant="default" className="flex items-center gap-1 bg-green-500">
                          <Check size={12} />
                          Processed
                        </Badge>
                      )
                    ) : (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <AlertTriangle size={12} />
                        Pending
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {file.processingErrors && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewError(file)}
                      >
                        View Error
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog
          open={isErrorDialogOpen}
          onOpenChange={(open) => setIsErrorDialogOpen(open)}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Processing Error
              </DialogTitle>
              <DialogDescription>
                {selectedFile?.originalFilename}
              </DialogDescription>
            </DialogHeader>
            <div className="bg-muted/50 p-4 rounded-md">
              <pre className="whitespace-pre-wrap text-sm">
                {selectedFile?.processingErrors}
              </pre>
            </div>
            <DialogFooter>
              <Button
                onClick={() => setIsErrorDialogOpen(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}