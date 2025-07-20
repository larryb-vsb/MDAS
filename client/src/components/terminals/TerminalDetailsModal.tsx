import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Terminal } from "@shared/schema";
import { Wifi, CreditCard, Shield, Calendar, MapPin, Building, Edit, Save, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatTableDate } from "@/lib/date-utils";

interface TerminalDetailsModalProps {
  terminal: Terminal | null;
  open: boolean;
  onClose: () => void;
}

export function TerminalDetailsModal({ terminal, open, onClose }: TerminalDetailsModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Terminal>>({});
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Initialize edit data when terminal changes
  useEffect(() => {
    if (terminal) {
      setEditData(terminal);
    }
  }, [terminal]);

  // Update terminal mutation
  const updateTerminalMutation = useMutation({
    mutationFn: async (data: Partial<Terminal>) => {
      console.log("Sending terminal update:", data);
      try {
        const response = await apiRequest("PUT", `/api/terminals/${terminal?.id}`, data);
        console.log("API response status:", response.status);
        console.log("API response headers:", Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("API error response:", errorText);
          throw new Error(errorText || `HTTP ${response.status}`);
        }
        
        const contentType = response.headers.get('content-type');
        console.log("Content-Type:", contentType);
        
        if (contentType && contentType.includes('application/json')) {
          const result = await response.json();
          console.log("API success response:", result);
          return result;
        } else {
          const textResult = await response.text();
          console.log("API text response:", textResult);
          throw new Error("API returned non-JSON response: " + textResult);
        }
      } catch (error) {
        console.error("Terminal update error:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/terminals"] });
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Terminal updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update terminal",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    // Only send fields that can be updated, exclude system fields
    const updateFields = {
      vNumber: editData.vNumber,
      posMerchantNumber: editData.posMerchantNumber,
      bin: editData.bin,
      dbaName: editData.dbaName,
      dailyAuth: editData.dailyAuth,
      dialPay: editData.dialPay,
      encryption: editData.encryption,
      prr: editData.prr,
      mcc: editData.mcc,
      ssl: editData.ssl,
      tokenization: editData.tokenization,
      agent: editData.agent,
      chain: editData.chain,
      store: editData.store,
      terminalInfo: editData.terminalInfo,
      recordStatus: editData.recordStatus,
      boardDate: editData.boardDate,
      terminalVisa: editData.terminalVisa,
      terminalType: editData.terminalType,
      status: editData.status,
      location: editData.location,
      mType: editData.mType,
      mLocation: editData.mLocation,
      installationDate: editData.installationDate,
      hardwareModel: editData.hardwareModel,
      manufacturer: editData.manufacturer,
      firmwareVersion: editData.firmwareVersion,
      networkType: editData.networkType,
      ipAddress: editData.ipAddress,
      genericField1: editData.genericField1,
      genericField2: editData.genericField2,
      description: editData.description,
      notes: editData.notes,
      internalNotes: editData.internalNotes,
      lastSyncDate: editData.lastSyncDate,
      syncStatus: editData.syncStatus
    };
    
    updateTerminalMutation.mutate(updateFields);
  };

  const handleCancel = () => {
    if (terminal) {
      setEditData(terminal);
    }
    setIsEditing(false);
  };

  if (!terminal) return null;

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === "active") {
      return <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>;
    } else if (statusLower === "inactive") {
      return <Badge variant="secondary">Inactive</Badge>;
    } else {
      return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTerminalTypeIcon = (type: string | null) => {
    if (!type) return <CreditCard className="h-4 w-4 text-muted-foreground" />;
    
    const typeLower = type.toLowerCase();
    if (typeLower.includes("wireless") || typeLower.includes("wifi")) {
      return <Wifi className="h-4 w-4 text-blue-500" />;
    } else if (typeLower.includes("secure") || typeLower.includes("encrypted")) {
      return <Shield className="h-4 w-4 text-green-500" />;
    } else {
      return <CreditCard className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getTerminalTypeIcon(terminal.terminalType)}
              Terminal Details - {terminal.vNumber}
            </div>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <Button
                    onClick={handleSave}
                    disabled={updateTerminalMutation.isPending}
                    className="h-8 px-3"
                  >
                    <Save className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                  <Button
                    onClick={handleCancel}
                    variant="outline"
                    disabled={updateTerminalMutation.isPending}
                    className="h-8 px-3"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => setIsEditing(true)}
                  variant="outline"
                  className="h-8 px-3"
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </DialogTitle>
          <DialogDescription>
            {isEditing ? "Edit terminal information and click Save to update." : "View terminal configuration and details."}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Building className="h-5 w-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">V Number</Label>
                {isEditing ? (
                  <Input
                    value={editData.vNumber || ""}
                    onChange={(e) => setEditData(prev => ({ ...prev, vNumber: e.target.value }))}
                    className="font-mono text-lg mt-1"
                  />
                ) : (
                  <p className="font-mono text-lg">{terminal.vNumber}</p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">DBA Name</Label>
                {isEditing ? (
                  <Input
                    value={editData.dbaName || ""}
                    onChange={(e) => setEditData(prev => ({ ...prev, dbaName: e.target.value }))}
                    className="mt-1"
                  />
                ) : (
                  <p>{terminal.dbaName || "N/A"}</p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">POS Merchant #</Label>
                {isEditing ? (
                  <Input
                    value={editData.posMerchantNumber || ""}
                    onChange={(e) => setEditData(prev => ({ ...prev, posMerchantNumber: e.target.value }))}
                    className="font-mono mt-1"
                  />
                ) : (
                  <p className="font-mono">{terminal.posMerchantNumber || "N/A"}</p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">BIN</Label>
                {isEditing ? (
                  <Input
                    value={editData.bin || ""}
                    onChange={(e) => setEditData(prev => ({ ...prev, bin: e.target.value }))}
                    className="font-mono mt-1"
                  />
                ) : (
                  <p className="font-mono">{terminal.bin || "N/A"}</p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Status</Label>
                {isEditing ? (
                  <Select
                    value={editData.status || ""}
                    onValueChange={(value) => setEditData(prev => ({ ...prev, status: value }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                      <SelectItem value="Maintenance">Maintenance</SelectItem>
                      <SelectItem value="Deployed">Deployed</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="mt-1">
                    {getStatusBadge(terminal.status || "Unknown")}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Terminal Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Terminal Type</Label>
                {isEditing ? (
                  <Input
                    value={editData.terminalType || ""}
                    onChange={(e) => setEditData(prev => ({ ...prev, terminalType: e.target.value }))}
                    className="mt-1"
                  />
                ) : (
                  <p>{terminal.terminalType || "N/A"}</p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">MCC</Label>
                {isEditing ? (
                  <Input
                    value={editData.mcc || ""}
                    onChange={(e) => setEditData(prev => ({ ...prev, mcc: e.target.value }))}
                    className="mt-1"
                  />
                ) : (
                  <p>{terminal.mcc || "N/A"}</p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Agent</Label>
                {isEditing ? (
                  <Input
                    value={editData.agent || ""}
                    onChange={(e) => setEditData(prev => ({ ...prev, agent: e.target.value }))}
                    className="mt-1"
                  />
                ) : (
                  <p>{terminal.agent || "N/A"}</p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Chain</Label>
                {isEditing ? (
                  <Input
                    value={editData.chain || ""}
                    onChange={(e) => setEditData(prev => ({ ...prev, chain: e.target.value }))}
                    className="mt-1"
                  />
                ) : (
                  <p>{terminal.chain || "N/A"}</p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Store</Label>
                {isEditing ? (
                  <Input
                    value={editData.store || ""}
                    onChange={(e) => setEditData(prev => ({ ...prev, store: e.target.value }))}
                    className="mt-1"
                  />
                ) : (
                  <p>{terminal.store || "N/A"}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Location Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Location
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Location</Label>
                {isEditing ? (
                  <Input
                    value={editData.location || ""}
                    onChange={(e) => setEditData(prev => ({ ...prev, location: e.target.value }))}
                    className="mt-1"
                  />
                ) : (
                  <p>{terminal.location || "N/A"}</p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">M Type (Local)</Label>
                {isEditing ? (
                  <Input
                    value={editData.mType || ""}
                    onChange={(e) => setEditData(prev => ({ ...prev, mType: e.target.value }))}
                    className="mt-1"
                    placeholder="Local merchant type"
                  />
                ) : (
                  <p>{terminal.mType || "N/A"}</p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">M Location (Local)</Label>
                {isEditing ? (
                  <Input
                    value={editData.mLocation || ""}
                    onChange={(e) => setEditData(prev => ({ ...prev, mLocation: e.target.value }))}
                    className="mt-1"
                    placeholder="Local location information"
                  />
                ) : (
                  <p>{terminal.mLocation || "N/A"}</p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">IP Address</Label>
                {isEditing ? (
                  <Input
                    value={editData.ipAddress || ""}
                    onChange={(e) => setEditData(prev => ({ ...prev, ipAddress: e.target.value }))}
                    className="font-mono mt-1"
                  />
                ) : (
                  <p className="font-mono">{terminal.ipAddress || "N/A"}</p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Network Type</Label>
                {isEditing ? (
                  <Input
                    value={editData.networkType || ""}
                    onChange={(e) => setEditData(prev => ({ ...prev, networkType: e.target.value }))}
                    className="mt-1"
                  />
                ) : (
                  <p>{terminal.networkType || "N/A"}</p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Hardware Model</Label>
                {isEditing ? (
                  <Input
                    value={editData.hardwareModel || ""}
                    onChange={(e) => setEditData(prev => ({ ...prev, hardwareModel: e.target.value }))}
                    className="mt-1"
                  />
                ) : (
                  <p>{terminal.hardwareModel || "N/A"}</p>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Manufacturer</Label>
                {isEditing ? (
                  <Input
                    value={editData.manufacturer || ""}
                    onChange={(e) => setEditData(prev => ({ ...prev, manufacturer: e.target.value }))}
                    className="mt-1"
                  />
                ) : (
                  <p>{terminal.manufacturer || "N/A"}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Technical Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Technical Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Encryption</label>
                <p>{terminal.encryption || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Board Date</label>
                <p>{terminal.boardDate ? new Date(terminal.boardDate).toLocaleDateString() : "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Last Activity</label>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <p>{terminal.lastActivity ? formatTableDate(terminal.lastActivity.toString()) : "N/A"}</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Last Update</label>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <p>{terminal.lastUpdate ? formatTableDate(terminal.lastUpdate.toString()) : "N/A"}</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Update Source</label>
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <p>{terminal.updateSource || "N/A"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Additional Information - Always show in edit mode */}
        {(terminal.notes || terminal.internalNotes || terminal.description || isEditing) && (
          <>
            <Separator />
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Additional Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Description</Label>
                  {isEditing ? (
                    <Textarea
                      value={editData.description || ""}
                      onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
                      className="mt-1"
                      rows={3}
                    />
                  ) : (
                    terminal.description && (
                      <p className="mt-1 text-sm bg-muted p-3 rounded-md">{terminal.description}</p>
                    )
                  )}
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Notes</Label>
                  {isEditing ? (
                    <Textarea
                      value={editData.notes || ""}
                      onChange={(e) => setEditData(prev => ({ ...prev, notes: e.target.value }))}
                      className="mt-1"
                      rows={3}
                    />
                  ) : (
                    terminal.notes && (
                      <p className="mt-1 text-sm bg-muted p-3 rounded-md">{terminal.notes}</p>
                    )
                  )}
                </div>
                {terminal.internalNotes && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Internal Notes</label>
                    <p className="mt-1 text-sm bg-muted p-3 rounded-md">{terminal.internalNotes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
        
        {/* Bottom Save/Cancel buttons - always visible when editing */}
        {isEditing && (
          <div className="mt-6 pt-4 border-t bg-gradient-to-r from-muted/20 to-muted/10 -mx-6 px-6 pb-2">
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={updateTerminalMutation.isPending}
                className="min-w-[100px]"
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateTerminalMutation.isPending}
                className="min-w-[100px] bg-primary hover:bg-primary/90"
              >
                <Save className="h-4 w-4 mr-1" />
                {updateTerminalMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}