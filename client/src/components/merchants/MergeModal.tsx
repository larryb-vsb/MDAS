import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowRight, Building } from "lucide-react";
import { Merchant } from "@/lib/types";

interface MergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (targetMerchantId: string, sourceMerchantIds: string[]) => void;
  selectedMerchants: Merchant[];
  isLoading: boolean;
}

export default function MergeModal({
  isOpen,
  onClose,
  onConfirm,
  selectedMerchants,
  isLoading,
}: MergeModalProps) {
  const [targetMerchantId, setTargetMerchantId] = useState<string>("");

  const handleConfirm = () => {
    if (!targetMerchantId) return;
    
    const sourceMerchantIds = (selectedMerchants || [])
      .filter(merchant => merchant.id !== targetMerchantId)
      .map(merchant => merchant.id);
    
    console.log('[MERGE MODAL] Confirming merge:', {
      targetMerchantId,
      sourceMerchantIds,
      selectedMerchants: selectedMerchants?.map(m => ({ id: m.id, name: m.name }))
    });
    
    onConfirm(targetMerchantId, sourceMerchantIds);
    setTargetMerchantId("");
  };

  const handleClose = () => {
    setTargetMerchantId("");
    onClose();
  };

  const targetMerchant = (selectedMerchants || []).find(m => m.id === targetMerchantId);
  const sourceMerchants = (selectedMerchants || []).filter(m => m.id !== targetMerchantId);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            Merge Merchants
          </DialogTitle>
          <DialogDescription>
            Choose which merchant will be the primary merchant. All transactions from other merchants will be transferred to it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium">Select Primary Merchant</label>
            <Select value={targetMerchantId} onValueChange={setTargetMerchantId}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Choose the merchant to keep" />
              </SelectTrigger>
              <SelectContent>
                {(selectedMerchants || []).map((merchant) => (
                  <SelectItem key={merchant.id} value={merchant.id}>
                    {merchant.name} ({merchant.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {targetMerchantId && (
            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="font-medium mb-3">Merge Preview</h4>
              
              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2 text-green-700">
                    <Building className="h-4 w-4" />
                    <span className="font-medium">Primary Merchant (will keep):</span>
                  </div>
                  <div className="ml-6 text-sm">
                    {targetMerchant?.name}
                    <Badge className="ml-2" variant="secondary">{targetMerchant?.status}</Badge>
                  </div>
                </div>

                {sourceMerchants.length > 0 && (
                  <div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground mx-auto" />
                    <div className="flex items-center gap-2 text-orange-700 mt-2">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">Will be merged and marked as "Removed":</span>
                    </div>
                    <div className="ml-6 space-y-1">
                      {sourceMerchants.map((merchant) => (
                        <div key={merchant.id} className="text-sm">
                          {merchant.name}
                          <Badge className="ml-2" variant="secondary">{merchant.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <strong>Important:</strong> All transactions from the merchants being merged will be transferred to the primary merchant. The source merchants will be marked as "Removed" with audit notes.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={!targetMerchantId || isLoading}
            className="bg-gradient-to-r from-blue-500 to-blue-700"
          >
            {isLoading ? "Merging..." : `Merge ${selectedMerchants.length} Merchants`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}