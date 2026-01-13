import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, CreditCard } from 'lucide-react';
import { 
  JsonbRecord, 
  getRecordTypeBadgeColor, 
  formatFieldValue, 
  extractCardType, 
  getCardTypeBadges,
  extractTTI,
  extractTerminalId 
} from '@/lib/tddf-shared';

interface TddfRecordCardProps {
  record: JsonbRecord;
  compact?: boolean;
  showDetails?: boolean;
  onViewDetails?: (record: JsonbRecord) => void;
  className?: string;
}

export function TddfRecordCard({ 
  record, 
  compact = false, 
  showDetails = true,
  onViewDetails,
  className = ''
}: TddfRecordCardProps) {
  const cardType = extractCardType(record);
  const tti = extractTTI(record);
  const terminalId = extractTerminalId(record);
  
  const cardTypeBadge = cardType ? getCardTypeBadges(cardType) : null;

  return (
    <Card className={`hover:shadow-md transition-shadow ${className}`}>
      <CardHeader className={compact ? "pb-2" : "pb-3"}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={getRecordTypeBadgeColor(record.record_type)}
            >
              {record.record_type}
            </Badge>
            
            {/* Card Type Badge */}
            {cardTypeBadge && (
              <Badge 
                variant="outline" 
                className={`${cardTypeBadge.className} gap-1`}
              >
                <CreditCard className="h-3 w-3" />
                {cardTypeBadge.label}
              </Badge>
            )}
            
            {/* TTI Field with Purple Highlighting */}
            {tti && (
              <Badge 
                variant="outline" 
                className="bg-purple-50 text-purple-700 border-purple-200"
                title="Transaction Type Identifier"
              >
                TTI: {tti}
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Line {record.line_number}</span>
            {showDetails && onViewDetails && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewDetails(record)}
                className="h-6 w-6 p-0 ml-2"
              >
                <Eye className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className={compact ? "pt-0" : "pt-2"}>
        <div className="space-y-2">
          {/* Key Fields Display */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            {/* Merchant Account Number - Blue highlighting */}
            {record.extracted_fields?.merchantAccountNumber && (
              <div className="bg-blue-50 dark:bg-blue-950 p-2 rounded border border-blue-200 dark:border-blue-800">
                <span className="font-medium text-blue-700 dark:text-blue-300">Merchant Account:</span>
                <div className="text-blue-900 dark:text-blue-100">
                  {formatFieldValue('merchantAccountNumber', record.extracted_fields.merchantAccountNumber)}
                </div>
              </div>
            )}
            
            {/* Terminal ID */}
            {terminalId && (
              <div>
                <span className="font-medium text-muted-foreground">Terminal ID:</span>
                <div>{terminalId}</div>
              </div>
            )}
            
            {/* Amount */}
            {record.extracted_fields?.amount && (
              <div>
                <span className="font-medium text-muted-foreground">Amount:</span>
                <div className="font-mono">
                  {formatFieldValue('amount', record.extracted_fields.amount)}
                </div>
              </div>
            )}
            
            {/* Date */}
            {record.extracted_fields?.date && (
              <div>
                <span className="font-medium text-muted-foreground">Date:</span>
                <div>{formatFieldValue('date', record.extracted_fields.date)}</div>
              </div>
            )}
          </div>
          
          {/* Additional Fields (non-compact mode) */}
          {!compact && record.extracted_fields && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-muted-foreground">
                {Object.entries(record.extracted_fields)
                  .filter(([key]) => !['merchantAccountNumber', 'amount', 'date', 'cardType', 'transactionTypeIdentifier'].includes(key))
                  .slice(0, compact ? 3 : 6)
                  .map(([key, value]) => (
                    <div key={key}>
                      <span className="font-medium">{key}:</span>
                      <div className="truncate">{formatFieldValue(key, value)}</div>
                    </div>
                  ))}
              </div>
            </div>
          )}
          
          {/* Processing Info */}
          {record.processing_time_ms && (
            <div className="text-xs text-muted-foreground mt-2">
              Processed in {record.processing_time_ms}ms
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}