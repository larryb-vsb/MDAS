import React, { useState } from 'react';
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface CacheControlWidgetProps {
  isDarkMode?: boolean;
  initialExpiration?: string;
  className?: string;
}

export default function CacheControlWidget({ 
  isDarkMode = false, 
  initialExpiration = "30",
  className = ""
}: CacheControlWidgetProps) {
  const [selectedExpiration, setSelectedExpiration] = useState<string>(initialExpiration);
  const queryClient = useQueryClient();

  // Update cache expiration mutation
  const updateExpirationMutation = useMutation({
    mutationFn: async (expiration: string | number) => {
      const body = expiration === 'never' 
        ? { never: true }
        : { minutes: typeof expiration === 'string' ? parseInt(expiration) : expiration };
      
      return apiRequest(`/api/dashboard/cache-expiration`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: () => {
      const description = selectedExpiration === 'never' 
        ? "Cache will never expire" 
        : `Cache will now expire in ${selectedExpiration} minutes`;
      
      toast({
        title: "Cache Expiration Updated",
        description,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/cache-status-only"] });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update cache expiration",
        variant: "destructive",
      });
    }
  });

  return (
    <div className={`pt-3 border-t space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <Settings className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Cache Expiration:</span>
      </div>
      <div className="flex gap-2">
        <Select value={selectedExpiration} onValueChange={setSelectedExpiration}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15">15 minutes</SelectItem>
            <SelectItem value="30">30 minutes</SelectItem>
            <SelectItem value="60">1 hour</SelectItem>
            <SelectItem value="120">2 hours</SelectItem>
            <SelectItem value="240">4 hours</SelectItem>
            <SelectItem value="480">8 hours</SelectItem>
            <SelectItem value="never">Never expire</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => updateExpirationMutation.mutate(selectedExpiration)}
          disabled={updateExpirationMutation.isPending}
        >
          {updateExpirationMutation.isPending ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            "Set"
          )}
        </Button>
      </div>
    </div>
  );
}