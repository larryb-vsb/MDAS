import React from 'react';

// This is just a reference for the correct Tabs structure
export const MerchantTabsExample = () => {
  return (
    <Tabs defaultValue="overview">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="demographics">Demographics</TabsTrigger>
        <TabsTrigger value="transactions">Transactions</TabsTrigger>
      </TabsList>
      
      <TabsContent value="overview">
        {/* Overview tab content */}
        <div>Overview content goes here</div>
      </TabsContent>
      
      <TabsContent value="demographics">
        {/* Demographics tab content */}
        <div>Demographics content goes here</div>
      </TabsContent>
      
      <TabsContent value="transactions">
        {/* Transactions tab content */}
        <div>Transactions content goes here</div>
      </TabsContent>
    </Tabs>
  );
};