import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, FileText } from "lucide-react";
import { formatTableDate, formatTddfDate } from "@/lib/date-utils";

// Card type badge configuration
function getCardTypeBadges(cardType: string) {
  const badges: Record<string, { label: string; className: string }> = {
    'VD': { label: 'Visa Debit', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    'VC': { label: 'Visa Credit', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    'MD': { label: 'Mastercard Debit', className: 'bg-orange-50 text-orange-700 border-orange-200' },
    'MC': { label: 'Mastercard Credit', className: 'bg-orange-50 text-orange-700 border-orange-200' },
    'AX': { label: 'American Express', className: 'bg-green-50 text-green-700 border-green-200' },
    'DS': { label: 'Discover', className: 'bg-purple-50 text-purple-700 border-purple-200' },
    'DI': { label: 'Diners Club', className: 'bg-gray-50 text-gray-700 border-gray-200' },
    'JC': { label: 'JCB', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  };
  return badges[cardType] || { label: cardType, className: 'bg-gray-50 text-gray-700 border-gray-200' };
}

interface TddfTransactionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: any;
  terminal?: any;
}

export function TddfTransactionDetailModal({ 
  isOpen, 
  onClose, 
  transaction, 
  terminal 
}: TddfTransactionDetailModalProps) {
  if (!transaction) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            TDDF Transaction Detail
          </DialogTitle>
          <DialogDescription>
            Complete transaction information from TDDF processing
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="fields">Field Details</TabsTrigger>
          </TabsList>
          
          <TabsContent value="summary" className="space-y-6 mt-6">
            {/* Transaction Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Transaction Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Transaction Date</p>
                    <p className="font-semibold">
                      {transaction.transactionDate 
                        ? formatTddfDate(transaction.transactionDate)
                        : 'N/A'
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Amount</p>
                    <p className="font-semibold text-lg text-green-600">
                      ${parseFloat(transaction.transactionAmount || 0).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Card Type</p>
                    <div className="mt-1">
                      {transaction.cardType ? (
                        <span 
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getCardTypeBadges(transaction.cardType).className}`}
                        >
                          <CreditCard className="h-3 w-3" />
                          {getCardTypeBadges(transaction.cardType).label}
                        </span>
                      ) : (
                        <Badge variant="outline">N/A</Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Authorization #</p>
                    <p className="font-mono font-semibold">
                      {transaction.authorizationNumber || 'N/A'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Merchant & Terminal Information */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Merchant Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Merchant Name</p>
                    <p className="font-semibold">{transaction.merchantName || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Merchant Account #</p>
                    <p className="font-mono text-sm">{transaction.merchantAccountNumber || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">MCC Code</p>
                    <p className="font-mono">{transaction.mccCode || 'N/A'}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Terminal Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Terminal ID</p>
                    <p className="font-mono font-semibold">{transaction.terminalId || 'N/A'}</p>
                  </div>
                  {terminal && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">VAR Number</p>
                      <p className="font-mono">{terminal.vNumber || 'N/A'}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Transaction Type</p>
                    <p className="font-mono">{transaction.transactionTypeIdentifier || 'Standard'}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Transaction Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">TDDF Record Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-medium text-muted-foreground">Reference Number</p>
                    <p className="font-mono text-xs bg-muted p-2 rounded break-all">
                      {transaction.referenceNumber || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">Record ID</p>
                    <p className="font-mono">{transaction.id}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">Recorded At</p>
                    <p className="text-sm">
                      {transaction.recordedAt 
                        ? formatTableDate(transaction.recordedAt)
                        : 'N/A'
                      }
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">Processing Status</p>
                    <Badge variant="secondary" className="text-xs">Processed</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fields" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Complete TDDF Field Details</CardTitle>
                <CardDescription>
                  All TDDF specification fields with position mappings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Header Fields (1-23) */}
                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-blue-700">Header Fields (1-23)</h4>
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">ID</span>
                        <span className="font-mono">{transaction.id}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Sequence Number (1-7)</span>
                        <span className="font-mono">{transaction.sequenceNumber || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Entry Run Number (8-13)</span>
                        <span className="font-mono">{transaction.entryRunNumber || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Sequence Within Run (14-17)</span>
                        <span className="font-mono">{transaction.sequenceWithinRun || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Record Identifier (18-19)</span>
                        <span className="font-mono">{transaction.recordIdentifier || 'DT'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Bank Number (20-23)</span>
                        <span className="font-mono">{transaction.bankNumber || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Merchant Account Fields (24-61) */}
                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-green-700">Merchant Account Fields (24-61)</h4>
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Merchant Account Number (24-39)</span>
                        <span className="font-mono">{transaction.merchantAccountNumber || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Association Number 1 (40-45)</span>
                        <span className="font-mono">{transaction.associationNumber1 || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Group Number (46-51)</span>
                        <span className="font-mono">{transaction.groupNumber || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Transaction Code (52-55)</span>
                        <span className="font-mono">{transaction.transactionCode || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Association Number 2 (56-61)</span>
                        <span className="font-mono">{transaction.associationNumber2 || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Transaction Identification Fields (62-123) */}
                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-purple-700">Transaction Identification Fields (62-123)</h4>
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Reference Number (62-84)</span>
                        <span className="font-mono text-xs break-all bg-muted p-1 rounded">{transaction.referenceNumber || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Transaction Amount (85-99)</span>
                        <span className="font-mono font-semibold text-green-600">${parseFloat(transaction.transactionAmount || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Transaction Date (100-103)</span>
                        <span className="font-mono">{transaction.transactionDate ? formatTddfDate(transaction.transactionDate) : 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Batch Julian Date (104-108)</span>
                        <span className="font-mono">{transaction.batchJulianDate || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Net Deposit (109-123)</span>
                        <span className="font-mono">{transaction.netDeposit || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card & Account Fields (124-187) */}
                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-orange-700">Card & Account Fields (124-187)</h4>
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Cardholder Account Number (124-142)</span>
                        <span className="font-mono">{transaction.cardholderAccountNumber || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">D/C Indicator (216)</span>
                        <span className="font-mono">{transaction.debitCreditIndicator || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Merchant Name (218-242)</span>
                        <span className="font-mono">{transaction.merchantName || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Authorization & Terminal Fields (243-284) */}
                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-red-700">Authorization & Terminal Fields (243-284)</h4>
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Authorization Number (243-250)</span>
                        <span className="font-mono">{transaction.authorizationNumber || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Card Type (253-254)</span>
                        <div>
                          {transaction.cardType ? (
                            <span 
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getCardTypeBadges(transaction.cardType).className}`}
                            >
                              <CreditCard className="h-3 w-3" />
                              {getCardTypeBadges(transaction.cardType).label}
                            </span>
                          ) : (
                            <span className="font-mono">N/A</span>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">MCC Code (273-276)</span>
                        <span className="font-mono">{transaction.mccCode || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Terminal ID (277-284)</span>
                        <span className="font-mono font-semibold">{transaction.terminalId || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Extended Fields (285+) */}
                  <div>
                    <h4 className="font-semibold text-sm mb-3 text-gray-700">Extended Fields (285+)</h4>
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Transaction Type Identifier (336-338)</span>
                        <span className="font-mono">{transaction.transactionTypeIdentifier || 'Standard'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Recorded At</span>
                        <span className="font-mono text-xs">{transaction.recordedAt ? formatTableDate(transaction.recordedAt) : 'N/A'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-gray-100">
                        <span className="text-muted-foreground">Processing Status</span>
                        <Badge variant="secondary" className="text-xs">Processed</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}