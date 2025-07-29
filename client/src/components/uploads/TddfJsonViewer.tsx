import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface TddfJsonRecord {
  recordType: string;
  lineNumber: number;
  rawLine: string;
  extractedFields: Record<string, any>;
  highlightedRecordIdentifier?: string;
  extractedFieldsCount?: number;
}

interface TddfJsonViewerProps {
  jsonSample: TddfJsonRecord[];
  recordTypeBreakdown: Record<string, number>;
}

export default function TddfJsonViewer({ jsonSample, recordTypeBreakdown }: TddfJsonViewerProps) {
  return (
    <div className="space-y-4">
      {/* Record Type Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Record Type Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(recordTypeBreakdown).map(([type, count]) => (
              <Badge 
                key={type} 
                variant="outline"
                className={`${
                  type === 'DT' ? 'border-blue-500 text-blue-700 bg-blue-50' :
                  type === 'BH' ? 'border-green-500 text-green-700 bg-green-50' :
                  type === 'P1' || type === 'P2' ? 'border-orange-500 text-orange-700 bg-orange-50' :
                  'border-gray-500 text-gray-700 bg-gray-50'
                }`}
              >
                {type}: {count}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* JSON Sample Display */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">JSON Sample (First 3 Records)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {jsonSample.map((record, index) => (
              <div key={index} className="border rounded-lg p-4 bg-gray-50">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="font-mono text-xs">
                    Line {record.lineNumber}
                  </Badge>
                  <Badge 
                    className={`${
                      record.recordType === 'DT' ? 'bg-blue-500' :
                      record.recordType === 'BH' ? 'bg-green-500' :
                      record.recordType === 'P1' || record.recordType === 'P2' ? 'bg-orange-500' :
                      'bg-gray-500'
                    } text-white`}
                  >
                    {record.recordType}
                  </Badge>
                  <span className="text-xs text-gray-600">
                    {record.extractedFieldsCount} fields extracted
                  </span>
                </div>
                
                {/* Raw Line Preview */}
                <div className="mb-3">
                  <div className="text-xs text-gray-600 mb-1">Raw TDDF Line:</div>
                  <div className="font-mono text-xs bg-white p-2 rounded border overflow-x-auto">
                    {/* Highlight the Record Identifier in red */}
                    <span>{record.rawLine.substring(0, 17)}</span>
                    <span className="bg-red-200 text-red-800 font-bold px-1">
                      {record.highlightedRecordIdentifier || record.recordType}
                    </span>
                    <span>{record.rawLine.substring(19)}</span>
                  </div>
                </div>

                {/* Extracted Fields */}
                <div>
                  <div className="text-xs text-gray-600 mb-2">Extracted Fields:</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {Object.entries(record.extractedFields).map(([key, value]) => (
                      <div key={key} className="flex justify-between bg-white p-2 rounded border">
                        <span className="font-medium text-gray-700">{key}:</span>
                        <span className={`${
                          key === 'recordIdentifier' ? 'text-red-600 font-bold' : 'text-gray-900'
                        } ml-2 break-all`}>
                          {value !== null && value !== undefined ? String(value) : 'null'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}