import React from 'react';
import { NextGenProcessingWidget } from '@/components/NextGenProcessingWidget';

const ProcessingDashboardPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        <NextGenProcessingWidget />
      </div>
    </div>
  );
};

export default ProcessingDashboardPage;