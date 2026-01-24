import { useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Bell, Plus, Trash2, Power, Edit2, X, Check, AlertCircle, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

interface SystemMessage {
  id: number;
  title: string;
  message: string;
  color: string;
  isActive: boolean;
  showPopup: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const COLORS = [
  { name: "red", bg: "bg-red-500", text: "text-white", label: "Red (Alert)" },
  { name: "orange", bg: "bg-orange-500", text: "text-white", label: "Orange (Warning)" },
  { name: "yellow", bg: "bg-yellow-400", text: "text-black", label: "Yellow (Caution)" },
  { name: "green", bg: "bg-green-500", text: "text-white", label: "Green (Success)" },
  { name: "blue", bg: "bg-blue-500", text: "text-white", label: "Blue (Info)" },
  { name: "grey", bg: "bg-gray-500", text: "text-white", label: "Grey (Neutral)" },
  { name: "white", bg: "bg-white border border-gray-300", text: "text-black", label: "White" },
];

function getColorClasses(color: string) {
  const found = COLORS.find(c => c.name === color);
  return found || COLORS.find(c => c.name === "blue")!;
}

export default function Notifications() {
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    message: "",
    color: "blue",
    isActive: true,
    showPopup: false,
  });

  const { data, isLoading, refetch } = useQuery<{ messages: SystemMessage[] }>({
    queryKey: ["/api/system-messages"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("/api/system-messages", { method: "POST", body: JSON.stringify(data) });
    },
    onSuccess: () => {
      toast({ title: "Message created", description: "System message has been created successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/system-messages"] });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create message", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      return apiRequest(`/api/system-messages/${id}`, { method: "PUT", body: JSON.stringify(data) });
    },
    onSuccess: () => {
      toast({ title: "Message updated", description: "System message has been updated successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/system-messages"] });
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update message", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/system-messages/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast({ title: "Message deleted", description: "System message has been deleted." });
      queryClient.invalidateQueries({ queryKey: ["/api/system-messages"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete message", variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return apiRequest(`/api/system-messages/${id}/toggle`, { method: "POST", body: JSON.stringify({ isActive }) });
    },
    onSuccess: () => {
      toast({ title: "Status updated", description: "Message status has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/system-messages"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to toggle message", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setIsCreating(false);
    setEditingId(null);
    setFormData({ title: "", message: "", color: "blue", isActive: true, showPopup: false });
  };

  const handleEdit = (msg: SystemMessage) => {
    setEditingId(msg.id);
    setIsCreating(true);
    setFormData({
      title: msg.title,
      message: msg.message,
      color: msg.color,
      isActive: msg.isActive,
      showPopup: msg.showPopup,
    });
  };

  const handleSubmit = () => {
    if (!formData.title.trim() || !formData.message.trim()) {
      toast({ title: "Validation Error", description: "Title and message are required", variant: "destructive" });
      return;
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const messages = data?.messages || [];
  const activeMessage = messages.find(m => m.isActive);

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="h-6 w-6 text-blue-500" />
              System Notifications
            </h1>
            <p className="text-muted-foreground">Manage system-wide dashboard announcements</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {!isCreating && (
              <Button onClick={() => setIsCreating(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Message
              </Button>
            )}
          </div>
        </div>

        {activeMessage && (
          <Card className="border-green-500 bg-green-50 dark:bg-green-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center gap-2">
                <Power className="h-4 w-4" />
                Currently Active Message
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`p-3 rounded-md ${getColorClasses(activeMessage.color).bg} ${getColorClasses(activeMessage.color).text}`}>
                <div className="font-semibold">{activeMessage.title}</div>
                <div className="text-sm mt-1">{activeMessage.message}</div>
              </div>
            </CardContent>
          </Card>
        )}

        {isCreating && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {editingId ? <Edit2 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                {editingId ? "Edit Message" : "Create New Message"}
              </CardTitle>
              <CardDescription>
                {editingId ? "Update the system message details" : "Create a new system-wide announcement"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Message title..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Enter your announcement message..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((color) => (
                    <button
                      key={color.name}
                      onClick={() => setFormData({ ...formData, color: color.name })}
                      className={`w-10 h-10 rounded-md ${color.bg} ${
                        formData.color === color.name ? "ring-2 ring-offset-2 ring-blue-500" : ""
                      } transition-all hover:scale-105`}
                      title={color.label}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Preview</Label>
                <div className={`p-3 rounded-md ${getColorClasses(formData.color).bg} ${getColorClasses(formData.color).text}`}>
                  <div className="font-semibold">{formData.title || "Title Preview"}</div>
                  <div className="text-sm mt-1">{formData.message || "Message preview will appear here..."}</div>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="isActive"
                      checked={formData.isActive}
                      onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                    />
                    <Label htmlFor="isActive">Set as Active</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="showPopup"
                      checked={formData.showPopup}
                      onCheckedChange={(checked) => setFormData({ ...formData, showPopup: checked })}
                    />
                    <Label htmlFor="showPopup">Show Popup</Label>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                  <Check className="h-4 w-4 mr-2" />
                  {editingId ? "Update Message" : "Create Message"}
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Message History</CardTitle>
            <CardDescription>All system messages, newest first</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No system messages yet</p>
                <p className="text-sm">Create your first announcement above</p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`border rounded-lg p-4 ${msg.isActive ? "border-green-500 bg-green-50/50 dark:bg-green-950/10" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`w-3 h-3 rounded-full ${getColorClasses(msg.color).bg}`}
                          />
                          <span className="font-semibold">{msg.title}</span>
                          {msg.isActive && (
                            <Badge variant="default" className="bg-green-500 text-white">Active</Badge>
                          )}
                          {msg.showPopup && (
                            <Badge variant="outline">Popup</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{msg.message}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          Created by {msg.createdBy || "system"} on {format(new Date(msg.createdAt), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleMutation.mutate({ id: msg.id, isActive: !msg.isActive })}
                          disabled={toggleMutation.isPending}
                          title={msg.isActive ? "Deactivate" : "Activate"}
                        >
                          <Power className={`h-4 w-4 ${msg.isActive ? "text-green-500" : "text-gray-400"}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(msg)}
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this message?")) {
                              deleteMutation.mutate(msg.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
