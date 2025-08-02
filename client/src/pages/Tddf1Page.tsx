import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';

const Tddf1Page: React.FC = () => {
  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-bold">TDDF1</CardTitle>
            <Button variant="outline" size="sm">
              <Menu className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">TDDF1 page content will go here.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Tddf1Page;