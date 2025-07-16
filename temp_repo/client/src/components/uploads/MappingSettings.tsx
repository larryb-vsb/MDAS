import React, { useState } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { 
  merchantFieldMappings, 
  transactionFieldMappings, 
  alternateTransactionMappings,
  defaultMerchantValues,
  transactionCodeMapping
} from '@shared/field-mappings';

type FieldMappingType = {
  [key: string]: string | null;
};

const MappingSettings = () => {
  const { toast } = useToast();
  const [merchantMappings, setMerchantMappings] = useState<FieldMappingType>({...merchantFieldMappings});
  const [transactionMappings, setTransactionMappings] = useState<FieldMappingType>({...transactionFieldMappings});
  const [alternateMapping, setAlternateMapping] = useState({...alternateTransactionMappings.format1});
  const [defaultValues, setDefaultValues] = useState({...defaultMerchantValues});
  const [transactionCodes, setTransactionCodes] = useState({...transactionCodeMapping});

  // Currently in view-only mode as we're not saving changes yet
  const handleSaveMappings = () => {
    toast({
      title: "Feature in development",
      description: "Saving custom mappings will be available in a future update.",
      variant: "default"
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-md font-medium">Field Mapping Configuration</CardTitle>
          <CardDescription>
            These settings control how data from CSV files is mapped to database fields
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="merchant">
            <TabsList>
              <TabsTrigger value="merchant">Merchant Fields</TabsTrigger>
              <TabsTrigger value="transaction">Transaction Fields</TabsTrigger>
              <TabsTrigger value="transaction-alt">Alternate Format</TabsTrigger>
              <TabsTrigger value="defaults">Default Values</TabsTrigger>
              <TabsTrigger value="codes">Transaction Codes</TabsTrigger>
            </TabsList>
            
            <TabsContent value="merchant" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Maps merchant CSV columns to database fields
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {Object.entries(merchantMappings).map(([dbField, csvField]) => (
                  <div key={dbField} className="flex flex-col space-y-1.5">
                    <Label htmlFor={`merchant-${dbField}`}>{dbField}</Label>
                    <Input 
                      id={`merchant-${dbField}`} 
                      value={csvField || ''} 
                      placeholder="Not mapped"
                      readOnly
                    />
                  </div>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="transaction" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Maps transaction CSV columns to database fields (standard format)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {Object.entries(transactionMappings).map(([dbField, csvField]) => (
                  <div key={dbField} className="flex flex-col space-y-1.5">
                    <Label htmlFor={`transaction-${dbField}`}>{dbField}</Label>
                    <Input 
                      id={`transaction-${dbField}`} 
                      value={csvField || ''} 
                      placeholder="Not mapped"
                      readOnly
                    />
                  </div>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="transaction-alt" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Maps alternate transaction CSV format to database fields
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {Object.entries(alternateMapping).map(([dbField, csvField]) => (
                  <div key={dbField} className="flex flex-col space-y-1.5">
                    <Label htmlFor={`alt-${dbField}`}>{dbField}</Label>
                    <Input 
                      id={`alt-${dbField}`} 
                      value={csvField || ''} 
                      placeholder="Not mapped"
                      readOnly
                    />
                  </div>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="defaults" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Default values used when fields are missing from imports
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {Object.entries(defaultValues).map(([field, value]) => (
                  <div key={field} className="flex flex-col space-y-1.5">
                    <Label htmlFor={`default-${field}`}>{field}</Label>
                    <Input 
                      id={`default-${field}`} 
                      value={value || ''} 
                      placeholder="No default"
                      readOnly
                    />
                  </div>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="codes" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                Transaction code mappings
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {Object.entries(transactionCodes).map(([code, type]) => (
                  <div key={code} className="flex flex-col space-y-1.5">
                    <Label htmlFor={`code-${code}`}>Code {code}</Label>
                    <Input 
                      id={`code-${code}`} 
                      value={type || ''} 
                      placeholder="Unmapped code"
                      readOnly
                    />
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-6">
            <Button onClick={handleSaveMappings}>
              Save Configuration
            </Button>
          </div>
        </CardContent>
      </Card>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="advanced">
          <AccordionTrigger>Field Mapping Documentation</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="font-medium">Merchant Demographics Fields:</h3>
                <p className="text-muted-foreground mt-1">
                  <code>ClientMID</code>, <code>ClientLegalName</code>, <code>ClientNumber</code>, <code>Mtype</code>, 
                  <code>ClientPAddress1</code>, <code>ClientPAddressCity</code>, <code>ClientPAddressState</code>, 
                  <code>ClientPAddressZip</code>, <code>ClientPAddressCountry</code>, <code>ClientSinceDate</code>, <code>AsOfDate</code>
                </p>
              </div>
              
              <div>
                <h3 className="font-medium">Standard Transaction Format:</h3>
                <p className="text-muted-foreground mt-1">
                  <code>TransactionID</code>, <code>MerchantID</code>, <code>Amount</code>, <code>Date</code>, <code>Type</code>
                </p>
              </div>
              
              <div>
                <h3 className="font-medium">Alternate Transaction Format:</h3>
                <p className="text-muted-foreground mt-1">
                  <code>Name</code>, <code>Account</code>, <code>Amount</code>, <code>Date</code>, 
                  <code>Code</code>, <code>Descr</code>, <code>TraceNbr</code>
                </p>
              </div>
              
              <div>
                <h3 className="font-medium">Merchant ID Aliases:</h3>
                <p className="text-muted-foreground mt-1">
                  The system will try to match merchants using these field names: <code>ClientMID</code>,
                  <code>MerchantID</code>, <code>Merchant_ID</code>, <code>ClientID</code>, <code>ClientNumber</code>
                </p>
              </div>
              
              <div>
                <h3 className="font-medium">Transaction Codes:</h3>
                <p className="text-muted-foreground mt-1">
                  <code>22</code> = Credit (money into account), <code>27</code> = Debit (money out of account)
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default MappingSettings;