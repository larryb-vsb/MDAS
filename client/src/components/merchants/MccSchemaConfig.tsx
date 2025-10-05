import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload, Trash2, Edit2, Search, CheckSquare, Square, ArrowUpDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface MccSchemaField {
  position: string;
  fieldName: string;
  fieldLength: number;
  format: string;
  description: string | null;
  mmsEnabled: number;
  createdAt: string;
  updatedAt: string;
}

type SortField = 'position' | 'fieldName' | 'fieldLength' | 'format' | 'mmsEnabled';
type SortOrder = 'asc' | 'desc';

export default function MccSchemaConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingField, setEditingField] = useState<MccSchemaField | null>(null);
  const [sortField, setSortField] = useState<SortField>('position');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [editFormData, setEditFormData] = useState<Partial<MccSchemaField>>({});

  // Fetch all fields
  const { data: fields, isLoading } = useQuery<MccSchemaField[]>({
    queryKey: ['/api/mcc-schema'],
  });

  // CSV Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/mcc-schema/upload-csv', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "CSV uploaded successfully",
        description: `Inserted: ${data.inserted}, Updated: ${data.updated}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/mcc-schema'] });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ position, data }: { position: string; data: Partial<MccSchemaField> }) => {
      return apiRequest(`/api/mcc-schema/${position}`, {
        method: 'PATCH',
        body: data,
      });
    },
    onSuccess: () => {
      toast({
        title: "Field updated",
        description: "Schema field updated successfully",
      });
      setEditingField(null);
      setEditFormData({});
      queryClient.invalidateQueries({ queryKey: ['/api/mcc-schema'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (positions: string[]) => {
      return apiRequest('/api/mcc-schema', {
        method: 'DELETE',
        body: { positions },
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Fields deleted",
        description: data.message,
      });
      setSelectedFields([]);
      queryClient.invalidateQueries({ queryKey: ['/api/mcc-schema'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  };

  const handleSelectAll = () => {
    if (selectedFields.length === filteredAndSortedFields.length) {
      setSelectedFields([]);
    } else {
      setSelectedFields(filteredAndSortedFields.map(f => f.position));
    }
  };

  const handleSelectField = (position: string) => {
    setSelectedFields(prev =>
      prev.includes(position)
        ? prev.filter(p => p !== position)
        : [...prev, position]
    );
  };

  const handleDeleteSelected = () => {
    if (selectedFields.length > 0 && window.confirm(`Delete ${selectedFields.length} field(s)?`)) {
      deleteMutation.mutate(selectedFields);
    }
  };

  const handleEditClick = (field: MccSchemaField) => {
    setEditingField(field);
    setEditFormData({
      fieldName: field.fieldName,
      fieldLength: field.fieldLength,
      format: field.format,
      description: field.description,
      mmsEnabled: field.mmsEnabled,
    });
  };

  const handleEditSave = () => {
    if (editingField) {
      updateMutation.mutate({
        position: editingField.position,
        data: editFormData,
      });
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Filter and sort fields
  const filteredAndSortedFields = (fields || [])
    .filter(field => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        field.position.toLowerCase().includes(query) ||
        field.fieldName.toLowerCase().includes(query) ||
        field.format.toLowerCase().includes(query) ||
        (field.description && field.description.toLowerCase().includes(query))
      );
    })
    .sort((a, b) => {
      let compareA: any = a[sortField];
      let compareB: any = b[sortField];

      if (typeof compareA === 'string') {
        compareA = compareA.toLowerCase();
        compareB = compareB.toLowerCase();
      }

      if (compareA < compareB) return sortOrder === 'asc' ? -1 : 1;
      if (compareA > compareB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1 inline text-gray-400" />;
    return <ArrowUpDown className={`h-4 w-4 ml-1 inline ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />;
  };

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              data-testid="input-search-schema"
              placeholder="Search position, field name, format..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
            data-testid="input-csv-file"
          />
          <Button
            data-testid="button-upload-csv"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            variant="outline"
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploadMutation.isPending ? 'Uploading...' : 'Upload CSV'}
          </Button>

          {selectedFields.length > 0 && (
            <Button
              data-testid="button-delete-selected"
              onClick={handleDeleteSelected}
              disabled={deleteMutation.isPending}
              variant="destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete ({selectedFields.length})
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="text-sm text-gray-600">
        Showing {filteredAndSortedFields.length} of {fields?.length || 0} fields
        {selectedFields.length > 0 && ` • ${selectedFields.length} selected`}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  data-testid="checkbox-select-all"
                  checked={selectedFields.length === filteredAndSortedFields.length && filteredAndSortedFields.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none"
                onClick={() => handleSort('position')}
                data-testid="header-position"
              >
                Position <SortIcon field="position" />
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none"
                onClick={() => handleSort('fieldName')}
                data-testid="header-field-name"
              >
                Field Name <SortIcon field="fieldName" />
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none"
                onClick={() => handleSort('fieldLength')}
                data-testid="header-field-length"
              >
                Length <SortIcon field="fieldLength" />
              </TableHead>
              <TableHead 
                className="cursor-pointer select-none"
                onClick={() => handleSort('format')}
                data-testid="header-format"
              >
                Format <SortIcon field="format" />
              </TableHead>
              <TableHead>Description</TableHead>
              <TableHead 
                className="cursor-pointer select-none text-center"
                onClick={() => handleSort('mmsEnabled')}
                data-testid="header-mms-enabled"
              >
                MMS <SortIcon field="mmsEnabled" />
              </TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filteredAndSortedFields.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                  {searchQuery ? 'No fields match your search' : 'No fields configured. Upload a CSV to get started.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedFields.map((field) => (
                <TableRow 
                  key={field.position}
                  data-testid={`row-field-${field.position}`}
                  className={selectedFields.includes(field.position) ? 'bg-blue-50' : ''}
                >
                  <TableCell>
                    <Checkbox
                      data-testid={`checkbox-field-${field.position}`}
                      checked={selectedFields.includes(field.position)}
                      onCheckedChange={() => handleSelectField(field.position)}
                    />
                  </TableCell>
                  <TableCell data-testid={`text-position-${field.position}`} className="font-mono">
                    {field.position}
                  </TableCell>
                  <TableCell data-testid={`text-field-name-${field.position}`}>
                    {field.fieldName}
                  </TableCell>
                  <TableCell data-testid={`text-field-length-${field.position}`}>
                    {field.fieldLength}
                  </TableCell>
                  <TableCell data-testid={`text-format-${field.position}`} className="font-mono text-sm">
                    {field.format}
                  </TableCell>
                  <TableCell className="max-w-xs truncate" title={field.description || ''}>
                    {field.description || '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    {field.mmsEnabled === 1 ? (
                      <CheckSquare className="h-5 w-5 text-green-600 mx-auto" data-testid={`icon-enabled-${field.position}`} />
                    ) : (
                      <Square className="h-5 w-5 text-gray-300 mx-auto" data-testid={`icon-disabled-${field.position}`} />
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      data-testid={`button-edit-${field.position}`}
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEditClick(field)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingField} onOpenChange={(open) => !open && setEditingField(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Field: {editingField?.position}</DialogTitle>
            <DialogDescription>
              Update the field configuration
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fieldName">Field Name</Label>
              <Input
                id="fieldName"
                data-testid="input-edit-field-name"
                value={editFormData.fieldName || ''}
                onChange={(e) => setEditFormData({ ...editFormData, fieldName: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fieldLength">Length</Label>
              <Input
                id="fieldLength"
                type="number"
                data-testid="input-edit-field-length"
                value={editFormData.fieldLength || ''}
                onChange={(e) => setEditFormData({ ...editFormData, fieldLength: parseInt(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="format">Format</Label>
              <Input
                id="format"
                data-testid="input-edit-format"
                value={editFormData.format || ''}
                onChange={(e) => setEditFormData({ ...editFormData, format: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                data-testid="input-edit-description"
                value={editFormData.description || ''}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="mmsEnabled"
                data-testid="checkbox-edit-mms-enabled"
                checked={editFormData.mmsEnabled === 1}
                onCheckedChange={(checked) => setEditFormData({ ...editFormData, mmsEnabled: checked ? 1 : 0 })}
              />
              <Label htmlFor="mmsEnabled">MMS Enabled</Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingField(null)}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={updateMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
