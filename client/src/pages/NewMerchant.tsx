import React from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  CardFooter 
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { Store, ArrowLeft, Save } from 'lucide-react';

// Define the merchant form schema
const merchantSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  clientMID: z.string().optional(),
  otherClientNumber1: z.string().optional(),
  otherClientNumber2: z.string().optional(),
  clientSinceDate: z.string().optional(), // We'll handle date conversion in the form
  status: z.string().default('Pending'),
  merchantType: z.union([z.number(), z.string()]).optional().transform(val => 
    typeof val === 'string' ? parseInt(val) || 0 : val || 0
  ), // Accept string or number and convert to number
  salesChannel: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
  category: z.string().optional(),
  editDate: z.string().optional() // We'll handle date conversion in the form
});

type MerchantFormValues = z.infer<typeof merchantSchema>;

export default function NewMerchant() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = React.useState(false);
  
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(prev => !prev);
  };
  
  const toggleUploadModal = () => {
    setIsUploadModalOpen(prev => !prev);
  };
  
  // Create form with validation
  const form = useForm<MerchantFormValues>({
    resolver: zodResolver(merchantSchema),
    defaultValues: {
      name: '',
      clientMID: '',
      otherClientNumber1: '',
      otherClientNumber2: '',
      clientSinceDate: '',
      status: 'Pending',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      country: '',
      category: '',
      editDate: ''
    }
  });
  
  // Create merchant mutation
  const createMerchant = useMutation({
    mutationFn: (values: MerchantFormValues) => {
      return apiRequest('/api/merchants', {
        method: 'POST',
        body: values
      });
    },
    onSuccess: async (response) => {
      const data = await response.json();
      toast({
        title: 'Merchant created',
        description: 'New merchant has been successfully created.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/merchants'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      navigate('/');
    },
    onError: (error) => {
      toast({
        title: 'Creation failed',
        description: error instanceof Error ? error.message : 'Failed to create merchant. Please try again.',
        variant: 'destructive',
      });
    }
  });

  const onSubmit = (values: MerchantFormValues) => {
    createMerchant.mutate(values);
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar isVisible={!isMobileMenuOpen} />
      
      <div className="flex-1 flex flex-col h-full overflow-auto">
        <Header toggleMobileMenu={toggleMobileMenu} toggleUploadModal={toggleUploadModal} />
        
        <div className="flex-1 p-6 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">New Merchant</h1>
              <p className="text-muted-foreground">
                Create a new merchant in the system
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={() => navigate('/merchants')}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Merchants
            </Button>
          </div>
          
          <Separator />
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Store className="mr-2 h-5 w-5 text-primary" />
                Merchant Information
              </CardTitle>
              <CardDescription>
                Enter the details for the new merchant
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Merchant Name*</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter merchant name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="clientMID"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Client MID</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter client MID" {...field} value={field.value || ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select 
                            onValueChange={field.onChange} 
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Pending">Pending</SelectItem>
                              <SelectItem value="Active">Active</SelectItem>
                              <SelectItem value="Inactive">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="merchantType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Merchant Type</FormLabel>
                          <Select 
                            onValueChange={(value) => field.onChange(parseInt(value))} 
                            defaultValue={(field.value || 0).toString()}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select merchant type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="0">None</SelectItem>
                              <SelectItem value="1">Type 1</SelectItem>
                              <SelectItem value="2">Type 2</SelectItem>
                              <SelectItem value="3">Type 3+</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="salesChannel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sales Channel</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter sales channel" {...field} value={field.value || ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select 
                            onValueChange={field.onChange} 
                            defaultValue={field.value || ''}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Retail">Retail</SelectItem>
                              <SelectItem value="Grocery">Grocery</SelectItem>
                              <SelectItem value="Electronics">Electronics</SelectItem>
                              <SelectItem value="Apparel">Apparel</SelectItem>
                              <SelectItem value="Healthcare">Healthcare</SelectItem>
                              <SelectItem value="Services">Services</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium mb-4">Address Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Street Address</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter street address" {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter city" {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="state"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>State/Province</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter state or province" {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="zipCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Zip/Postal Code</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter zip or postal code" {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="country"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Country</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter country" {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium mb-4">Additional Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="otherClientNumber1"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Other Client Number 1</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter other client number" {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="otherClientNumber2"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Other Client Number 2</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter other client number" {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="clientSinceDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Client Since Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="editDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Edit Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} value={field.value || ''} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                  
                  <CardFooter className="flex justify-end px-0 pb-0">
                    <Button 
                      type="submit" 
                      className="w-full md:w-auto"
                      disabled={createMerchant.isPending}
                    >
                      {createMerchant.isPending ? (
                        <>Creating...</>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Create Merchant
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}