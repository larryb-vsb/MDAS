import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
import { Plus, Calendar, Clock, Trash2, Edit, RotateCw } from "lucide-react";

// Validation schema for backup schedule
const backupScheduleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  timeOfDay: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Time must be in HH:MM format"),
  dayOfWeek: z.number().min(0).max(6).optional().nullable(),
  dayOfMonth: z.number().min(1).max(31).optional().nullable(),
  enabled: z.boolean().default(true),
  useS3: z.boolean().default(false),
  retentionDays: z.number().min(1).max(365).default(30),
  notes: z.string().optional().default("")
});

type BackupScheduleFormValues = z.infer<typeof backupScheduleSchema>;

export default function BackupScheduleManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null);

  // Format options for time selection
  const dayOptions = [
    { label: "Sunday", value: 0 },
    { label: "Monday", value: 1 },
    { label: "Tuesday", value: 2 },
    { label: "Wednesday", value: 3 },
    { label: "Thursday", value: 4 },
    { label: "Friday", value: 5 },
    { label: "Saturday", value: 6 }
  ];
  
  const monthDayOptions = Array.from({ length: 31 }, (_, i) => ({
    label: `${i + 1}${getDaySuffix(i + 1)}`, 
    value: i + 1
  }));

  // Query backup schedules
  const {
    data: schedules,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ["/api/settings/backup/schedules"],
    queryFn: async () => {
      try {
        console.log("Fetching backup schedules...");
        const res = await apiRequest("/api/settings/backup/schedules");
        const data = await res.json();
        console.log("Rendering schedules:", data);
        return data;
      } catch (err) {
        console.error("Error fetching schedules:", err);
        return []; // Return empty array to prevent parsing errors
      }
    },
  });

  // Form for adding new schedule
  const form = useForm<BackupScheduleFormValues>({
    resolver: zodResolver(backupScheduleSchema),
    defaultValues: {
      name: "",
      frequency: "daily",
      timeOfDay: "00:00",
      enabled: true,
      useS3: false,
      retentionDays: 30,
      notes: ""
    }
  });

  // Form for editing existing schedule
  const editForm = useForm<BackupScheduleFormValues>({
    resolver: zodResolver(backupScheduleSchema),
    defaultValues: {
      name: "",
      frequency: "daily",
      timeOfDay: "00:00",
      enabled: true,
      useS3: false,
      retentionDays: 30,
      notes: ""
    }
  });

  // Create schedule mutation
  const createScheduleMutation = useMutation({
    mutationFn: async (data: BackupScheduleFormValues) => {
      const res = await apiRequest("/api/settings/backup/schedules", {
        method: "POST",
        body: JSON.stringify(data)
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create backup schedule");
      }
      
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Schedule created",
        description: "Backup schedule has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/backup/schedules"] });
      setIsAddDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create schedule",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Update schedule mutation
  const updateScheduleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: BackupScheduleFormValues }) => {
      const res = await apiRequest(`/api/settings/backup/schedules/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data)
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update backup schedule");
      }
      
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Schedule updated",
        description: "Backup schedule has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/backup/schedules"] });
      setIsEditDialogOpen(false);
      setSelectedSchedule(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update schedule",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Delete schedule mutation
  const deleteScheduleMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/settings/backup/schedules/${id}`, {
        method: "DELETE"
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to delete backup schedule");
      }
      
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Schedule deleted",
        description: "Backup schedule has been deleted successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/backup/schedules"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete schedule",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Run schedule now mutation
  const runScheduleNowMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/settings/backup/schedules/${id}/run`, {
        method: "POST"
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to run backup schedule");
      }
      
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Backup created",
        description: `Scheduled backup "${data.scheduleName}" has been executed successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/backup/schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/backup/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/database"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to run backup",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Toggle schedule enabled status
  const toggleScheduleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const res = await apiRequest(`/api/settings/backup/schedules/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update backup schedule");
      }
      
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: `Schedule ${data.enabled ? 'enabled' : 'disabled'}`,
        description: `Backup schedule "${data.name}" has been ${data.enabled ? 'enabled' : 'disabled'}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/backup/schedules"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update schedule",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Handle form submission for new schedule
  const onSubmit = (values: BackupScheduleFormValues) => {
    // Handle conditional fields based on frequency
    if (values.frequency === "daily") {
      values.dayOfWeek = null;
      values.dayOfMonth = null;
    } else if (values.frequency === "weekly") {
      values.dayOfMonth = null;
    } else if (values.frequency === "monthly") {
      values.dayOfWeek = null;
    }
    
    createScheduleMutation.mutate(values);
  };

  // Handle form submission for editing schedule
  const onEditSubmit = (values: BackupScheduleFormValues) => {
    if (!selectedSchedule) return;
    
    // Handle conditional fields based on frequency
    if (values.frequency === "daily") {
      values.dayOfWeek = null;
      values.dayOfMonth = null;
    } else if (values.frequency === "weekly") {
      values.dayOfMonth = null;
    } else if (values.frequency === "monthly") {
      values.dayOfWeek = null;
    }
    
    updateScheduleMutation.mutate({ id: selectedSchedule.id, data: values });
  };

  // Open edit dialog with selected schedule data
  const handleEditSchedule = (schedule: any) => {
    setSelectedSchedule(schedule);
    
    editForm.reset({
      name: schedule.name,
      frequency: schedule.frequency,
      timeOfDay: schedule.timeOfDay,
      dayOfWeek: schedule.dayOfWeek,
      dayOfMonth: schedule.dayOfMonth,
      enabled: schedule.enabled,
      useS3: schedule.useS3,
      retentionDays: schedule.retentionDays,
      notes: schedule.notes || "",
    });
    
    setIsEditDialogOpen(true);
  };

  // Format date for display
  function formatDate(dateString: string | null) {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString();
  }
  
  // Get ordinal suffix for day numbers
  function getDaySuffix(day: number) {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return "st";
      case 2: return "nd";
      case 3: return "rd";
      default: return "th";
    }
  }
  
  // Format schedule frequency for display
  function formatSchedule(schedule: any) {
    let timing = "";
    
    if (schedule.frequency === "daily") {
      timing = `Daily at ${schedule.timeOfDay}`;
    } else if (schedule.frequency === "weekly") {
      const day = dayOptions.find(d => d.value === schedule.dayOfWeek)?.label || "Sunday";
      timing = `Weekly on ${day} at ${schedule.timeOfDay}`;
    } else if (schedule.frequency === "monthly") {
      const dayNum = schedule.dayOfMonth;
      timing = `Monthly on the ${dayNum}${getDaySuffix(dayNum)} at ${schedule.timeOfDay}`;
    }
    
    return timing;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <Calendar className="mr-2 h-5 w-5 text-primary" />
            Backup Schedules
          </div>
          <Button size="sm" onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Schedule
          </Button>
        </CardTitle>
        <CardDescription>
          Configure automatic backup schedules
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <RotateCw className="animate-spin h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Loading schedules...</p>
          </div>
        ) : isError ? (
          <div className="bg-destructive/10 p-4 rounded-md text-destructive">
            <p className="font-medium">Error loading backup schedules</p>
            <p className="text-sm">{error?.toString()}</p>
          </div>
        ) : (
          <ScrollArea className="h-[320px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Storage</TableHead>
                  <TableHead>Retention</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {console.log("Rendering schedules:", schedules)}
                {schedules && schedules.length > 0 ? (
                  schedules.map((schedule: any) => (
                    <TableRow key={schedule.id}>
                      <TableCell>
                        <Switch
                          checked={schedule.enabled}
                          onCheckedChange={(checked) => 
                            toggleScheduleMutation.mutate({ 
                              id: schedule.id, 
                              enabled: checked 
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium">{schedule.name}</TableCell>
                      <TableCell>{formatSchedule(schedule)}</TableCell>
                      <TableCell>{schedule.useS3 ? "S3 Cloud" : "Local"}</TableCell>
                      <TableCell>{schedule.retentionDays} days</TableCell>
                      <TableCell>{formatDate(schedule.lastRun)}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button 
                            variant="outline" 
                            size="icon" 
                            onClick={() => runScheduleNowMutation.mutate(schedule.id)}
                            title="Run now"
                          >
                            <RotateCw className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            onClick={() => handleEditSchedule(schedule)}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete the "${schedule.name}" schedule?`)) {
                                deleteScheduleMutation.mutate(schedule.id);
                              }
                            }}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No schedules configured. Click "Add Schedule" to create one.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
      <CardFooter className="flex flex-col space-y-2">
        <p className="text-sm text-muted-foreground">
          Scheduled backups will run automatically at the specified times.
          Retention policies will clean up old backups beyond the specified day limit.
        </p>
      </CardFooter>

      {/* Add Schedule Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Add Backup Schedule</DialogTitle>
            <DialogDescription>
              Configure a new automatic backup schedule. Backups will run according to the specified schedule.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Schedule Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Daily Backup" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="frequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Frequency</FormLabel>
                      <Select 
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="timeOfDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Time of Day</FormLabel>
                      <FormControl>
                        <div className="flex items-center">
                          <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                          <Input type="time" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {form.watch("frequency") === "weekly" && (
                <FormField
                  control={form.control}
                  name="dayOfWeek"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Day of Week</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select day" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {dayOptions.map(day => (
                            <SelectItem key={day.value} value={day.value.toString()}>
                              {day.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              {form.watch("frequency") === "monthly" && (
                <FormField
                  control={form.control}
                  name="dayOfMonth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Day of Month</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select day" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {monthDayOptions.map(day => (
                            <SelectItem key={day.value} value={day.value.toString()}>
                              {day.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        If the selected day doesn't exist in a month (e.g., 31st), the backup will run on the last day.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="retentionDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Retention (days)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={1} 
                          max={365}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="space-y-2 mt-7">
                  <div className="flex items-center space-x-2">
                    <FormField
                      control={form.control}
                      name="enabled"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel>Enabled</FormLabel>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <FormField
                      control={form.control}
                      name="useS3"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel>Use S3 Storage</FormLabel>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
              
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Description of this backup schedule" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsAddDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createScheduleMutation.isPending}
                >
                  {createScheduleMutation.isPending ? "Creating..." : "Create Schedule"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Schedule Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Edit Backup Schedule</DialogTitle>
            <DialogDescription>
              Update the backup schedule configuration.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Schedule Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Daily Backup" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="frequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Frequency</FormLabel>
                      <Select 
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="timeOfDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Time of Day</FormLabel>
                      <FormControl>
                        <div className="flex items-center">
                          <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                          <Input type="time" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {editForm.watch("frequency") === "weekly" && (
                <FormField
                  control={editForm.control}
                  name="dayOfWeek"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Day of Week</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select day" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {dayOptions.map(day => (
                            <SelectItem key={day.value} value={day.value.toString()}>
                              {day.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              {editForm.watch("frequency") === "monthly" && (
                <FormField
                  control={editForm.control}
                  name="dayOfMonth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Day of Month</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(parseInt(value))}
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select day" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {monthDayOptions.map(day => (
                            <SelectItem key={day.value} value={day.value.toString()}>
                              {day.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        If the selected day doesn't exist in a month (e.g., 31st), the backup will run on the last day.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="retentionDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Retention (days)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={1} 
                          max={365}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="space-y-2 mt-7">
                  <div className="flex items-center space-x-2">
                    <FormField
                      control={editForm.control}
                      name="enabled"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel>Enabled</FormLabel>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <FormField
                      control={editForm.control}
                      name="useS3"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel>Use S3 Storage</FormLabel>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
              
              <FormField
                control={editForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Description of this backup schedule" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateScheduleMutation.isPending}
                >
                  {updateScheduleMutation.isPending ? "Updating..." : "Update Schedule"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}