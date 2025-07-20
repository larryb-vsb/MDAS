import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Terminal } from "@shared/schema";
import { Wifi, CreditCard, Shield, Calendar, MapPin, Building } from "lucide-react";

interface TerminalDetailsModalProps {
  terminal: Terminal | null;
  open: boolean;
  onClose: () => void;
}

export function TerminalDetailsModal({ terminal, open, onClose }: TerminalDetailsModalProps) {
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
          <DialogTitle className="flex items-center gap-2">
            {getTerminalTypeIcon(terminal.terminalType)}
            Terminal Details - {terminal.vNumber}
          </DialogTitle>
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
                <label className="text-sm font-medium text-muted-foreground">V Number</label>
                <p className="font-mono text-lg">{terminal.vNumber}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">DBA Name</label>
                <p>{terminal.dbaName || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Master MID</label>
                <p className="font-mono">{terminal.masterMID || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">BIN</label>
                <p className="font-mono">{terminal.bin || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Status</label>
                <div className="mt-1">
                  {getStatusBadge(terminal.status || "Unknown")}
                </div>
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
                <label className="text-sm font-medium text-muted-foreground">Terminal Type</label>
                <p>{terminal.terminalType || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">MCC</label>
                <p>{terminal.mcc || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">BIN</label>
                <p className="font-mono">{terminal.bin || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Agent</label>
                <p>{terminal.agent || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Chain</label>
                <p>{terminal.chain || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Store</label>
                <p>{terminal.store || "N/A"}</p>
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
                <label className="text-sm font-medium text-muted-foreground">Location</label>
                <p>{terminal.location || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">IP Address</label>
                <p className="font-mono">{terminal.ipAddress || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Network Type</label>
                <p>{terminal.networkType || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Hardware Model</label>
                <p>{terminal.hardwareModel || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Manufacturer</label>
                <p>{terminal.manufacturer || "N/A"}</p>
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
                  <p>{terminal.lastActivity ? new Date(terminal.lastActivity).toLocaleDateString() : "N/A"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Additional Information */}
        {(terminal.notes || terminal.internalNotes || terminal.description) && (
          <>
            <Separator />
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Additional Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {terminal.description && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Description</label>
                    <p className="mt-1 text-sm bg-muted p-3 rounded-md">{terminal.description}</p>
                  </div>
                )}
                {terminal.notes && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Notes</label>
                    <p className="mt-1 text-sm bg-muted p-3 rounded-md">{terminal.notes}</p>
                  </div>
                )}
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
      </DialogContent>
    </Dialog>
  );
}