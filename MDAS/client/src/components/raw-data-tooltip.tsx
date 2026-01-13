import { useState } from "react";
import { FileText } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RawDataTooltipProps {
  rawData: Record<string, any> | null;
  sourceRowNumber?: number;
  recordedAt?: string;
  sourceFileName?: string;
}

export function RawDataTooltip({ rawData, sourceRowNumber, recordedAt, sourceFileName }: RawDataTooltipProps) {
  if (!rawData) {
    return null;
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="inline-flex items-center justify-center w-5 h-5 text-muted-foreground hover:text-foreground transition-colors">
            <FileText className="w-4 h-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" align="start" className="max-w-sm">
          <div className="space-y-2">
            <div className="font-semibold text-sm border-b pb-1">
              Original CSV Data
            </div>
            <div className="space-y-1 text-xs">
              {Object.entries(rawData).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-2">
                  <span className="font-medium text-muted-foreground min-w-0 flex-shrink-0">
                    {key}:
                  </span>
                  <span className="text-right break-all">
                    {value?.toString() || '-'}
                  </span>
                </div>
              ))}
            </div>
            {(sourceFileName || sourceRowNumber || recordedAt) && (
              <div className="border-t pt-2 mt-2 space-y-1 text-xs text-muted-foreground">
                {sourceFileName && (
                  <div className="font-medium">File: {sourceFileName}</div>
                )}
                {sourceRowNumber && (
                  <div>CSV Row: {sourceRowNumber}</div>
                )}
                {recordedAt && (
                  <div>Recorded: {formatDate(recordedAt)}</div>
                )}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}