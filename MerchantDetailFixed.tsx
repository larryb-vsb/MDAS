import React, { useState, useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import MainLayout from '../components/layout/MainLayout';
import { 
  Tabs, TabsContent, TabsList, TabsTrigger 
} from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function MerchantDetailFixed() {
  const [activeTab, setActiveTab] = useState('overview');
  const [location, setLocation] = useLocation();
  const [, params] = useRoute('/merchants/:id');
  
  // Update URL when tab changes
  useEffect(() => {
    if (params && params.id) {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', activeTab);
      window.history.replaceState({}, '', url.toString());
    }
  }, [activeTab, params]);

  // Set active tab from URL on load
  useEffect(() => {
    const url = new URL(window.location.href);
    const tabParam = url.searchParams.get('tab');
    if (tabParam && ['overview', 'demographics', 'transactions'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, []);

  return (
    <MainLayout>
      <div className="container px-4 py-6 mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Merchant Name</h1>
            <p className="text-gray-500">ID: 12345</p>
          </div>
          <Button 
            variant="outline"
            onClick={() => setLocation('/')}
          >
            Back to Dashboard
          </Button>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="demographics">Demographics</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <CardTitle>Overview Tab Content</CardTitle>
                <CardDescription>This is the overview tab.</CardDescription>
              </CardHeader>
              <CardContent>
                <p>This is the OVERVIEW content</p>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="demographics">
            <Card>
              <CardHeader>
                <CardTitle>Demographics Tab Content</CardTitle>
                <CardDescription>This is the demographics tab.</CardDescription>
              </CardHeader>
              <CardContent>
                <p>This is the DEMOGRAPHICS content</p>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle>Transactions Tab Content</CardTitle>
                <CardDescription>This is the transactions tab.</CardDescription>
              </CardHeader>
              <CardContent>
                <p>This is the TRANSACTIONS content</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}