import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

// Terminal form schema
const terminalSchema = z.object({
  vNumber: z.string().min(1, "V Number is required"),
  bin: z.string().optional(),
  dbaName: z.string().min(1, "DBA Name is required"),
  dailyAuth: z.string().optional(),
  dialPay: z.string().optional(),
  encryption: z.string().optional(),
  prr: z.string().optional(),
  mcc: z.string().optional(),
  ssl: z.string().optional(),
  tokenization: z.string().optional(),
  agent: z.string().optional(),
  chain: z.string().optional(),
  store: z.string().optional(),
  terminal: z.string().optional(),
  status: z.string().default("Active"),
  boardDate: z.string().optional(),
  terminalVisa: z.string().optional(),
  posMerchantNumber: z.string().optional(),
  terminalType: z.string().optional(),
  location: z.string().optional(),
  mType: z.string().optional(),
  mLocation: z.string().optional(),
  notes: z.string().optional(),
});

type TerminalFormData = z.infer<typeof terminalSchema>;

interface AddTerminalModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AddTerminalModal({ open, onClose }: AddTerminalModalProps) {
  const { toast } = useToast();

  const form = useForm<TerminalFormData>({
    resolver: zodResolver(terminalSchema),
    defaultValues: {
      vNumber: "",
      bin: "",
      dbaName: "",
      dailyAuth: "",
      dialPay: "Y",
      encryption: "Y", 
      prr: "Standard",
      mcc: "",
      ssl: "Y",
      tokenization: "Y",
      agent: "",
      chain: "",
      store: "",
      terminal: "",
      status: "Active",
      boardDate: "",
      terminalVisa: "Y",
      posMerchantNumber: "",
      terminalType: "countertop",
      location: "",
      mType: "",
      mLocation: "",
      notes: "",
    },
  });

  const createTerminalMutation = useMutation({
    mutationFn: async (terminalData: TerminalFormData) => {
      const response = await fetch("/api/terminals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(terminalData),
      });
      if (!response.ok) {
        throw new Error("Failed to create terminal");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/terminals"] });
      toast({
        title: "Terminal Created",
        description: "The terminal has been successfully added to the system.",
      });
      onClose();
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TerminalFormData) => {
    createTerminalMutation.mutate(data);
  };

  const handleClose = () => {
    if (!createTerminalMutation.isPending) {
      onClose();
      form.reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Terminal</DialogTitle>
          <DialogDescription>
            Create a new payment terminal entry with complete configuration details.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* V Number */}
              <FormField
                control={form.control}
                name="vNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>V Number *</FormLabel>
                    <FormControl>
                      <Input placeholder="VAR123456" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* DBA Name */}
              <FormField
                control={form.control}
                name="dbaName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>DBA Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Business Name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* BIN */}
              <FormField
                control={form.control}
                name="bin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>BIN</FormLabel>
                    <FormControl>
                      <Input placeholder="411111" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* POS Merchant # */}
              <FormField
                control={form.control}
                name="posMerchantNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>POS Merchant #</FormLabel>
                    <FormControl>
                      <Input placeholder="POS Merchant Number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Terminal Type */}
              <FormField
                control={form.control}
                name="terminalType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Terminal Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="countertop">Countertop</SelectItem>
                        <SelectItem value="mobile">Mobile</SelectItem>
                        <SelectItem value="virtual">Virtual</SelectItem>
                        <SelectItem value="integrated">Integrated POS</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Status */}
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                        <SelectItem value="Maintenance">Maintenance</SelectItem>
                        <SelectItem value="Deployed">Deployed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* MCC */}
              <FormField
                control={form.control}
                name="mcc"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>MCC</FormLabel>
                    <FormControl>
                      <Input placeholder="5411" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Daily Auth */}
              <FormField
                control={form.control}
                name="dailyAuth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Daily Auth</FormLabel>
                    <FormControl>
                      <Input placeholder="5000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Agent */}
              <FormField
                control={form.control}
                name="agent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agent</FormLabel>
                    <FormControl>
                      <Input placeholder="Agent Name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Chain */}
              <FormField
                control={form.control}
                name="chain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chain</FormLabel>
                    <FormControl>
                      <Input placeholder="CHAIN01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Store */}
              <FormField
                control={form.control}
                name="store"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Store</FormLabel>
                    <FormControl>
                      <Input placeholder="001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Terminal */}
              <FormField
                control={form.control}
                name="terminal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Terminal</FormLabel>
                    <FormControl>
                      <Input placeholder="TRM001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Board Date */}
              <FormField
                control={form.control}
                name="boardDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Board Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Location */}
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="Store location" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* M Type (Local) */}
              <FormField
                control={form.control}
                name="mType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>M Type (Local)</FormLabel>
                    <FormControl>
                      <Input placeholder="Local merchant type" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* M Location (Local) */}
              <FormField
                control={form.control}
                name="mLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>M Location (Local)</FormLabel>
                    <FormControl>
                      <Input placeholder="Local location information" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Configuration Options */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Configuration Settings</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Dial Pay */}
                <FormField
                  control={form.control}
                  name="dialPay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dial Pay</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Y">Yes</SelectItem>
                          <SelectItem value="N">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                {/* Encryption */}
                <FormField
                  control={form.control}
                  name="encryption"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Encryption</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Y">Yes</SelectItem>
                          <SelectItem value="N">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                {/* SSL */}
                <FormField
                  control={form.control}
                  name="ssl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SSL</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Y">Yes</SelectItem>
                          <SelectItem value="N">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                {/* Terminal Visa */}
                <FormField
                  control={form.control}
                  name="terminalVisa"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Terminal Visa</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Y">Yes</SelectItem>
                          <SelectItem value="N">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Additional notes or configuration details..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={createTerminalMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={form.handleSubmit(onSubmit)}
            disabled={createTerminalMutation.isPending}
          >
            {createTerminalMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create Terminal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}