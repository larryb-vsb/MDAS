import { Button } from '@/components/ui/button';
import { FileJson } from 'lucide-react';
import { useLocation } from 'wouter';

interface TddfJsonViewerProps {
  uploadId: string;
  filename: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function TddfJsonViewer({ uploadId, filename, onClose }: TddfJsonViewerProps) {
  const [, setLocation] = useLocation();

  const handleViewData = () => {
    // Close the current modal/state
    onClose();
    
    // Navigate to the full page viewer
    const encodedFilename = encodeURIComponent(filename);
    setLocation(`/tddf-viewer/${uploadId}/${encodedFilename}`);
  };

  return (
    <div className="p-4">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2 text-blue-600">
          <FileJson className="w-8 h-8" />
          <h3 className="text-lg font-medium">View TDDF JSONB Data</h3>
        </div>
        
        <p className="text-gray-600 text-sm">
          View the hierarchical structure and extracted fields from your TDDF file processing
        </p>
        
        <Button 
          onClick={handleViewData}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
        >
          <FileJson className="w-4 h-4" />
          Open Full Page Viewer
        </Button>
      </div>
    </div>
  );
}