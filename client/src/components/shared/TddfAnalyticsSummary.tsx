import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Database, 
  FileText, 
  TrendingUp, 
  Activity, 
  CheckCircle, 
  AlertTriangle 
} from 'lucide-react';
import { 
  TddfApiFile, 
  formatFileSize, 
  calculateTddfAnalytics 
} from '@/lib/tddf-shared';

interface TddfAnalyticsSummaryProps {
  files: TddfApiFile[];
  loading?: boolean;
  className?: string;
  variant?: 'full' | 'compact';
}

interface AnalyticsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  loading?: boolean;
  className?: string;
}

function AnalyticsCard({ 
  title, 
  value, 
  subtitle, 
  icon, 
  loading = false, 
  className = '' 
}: AnalyticsCardProps) {
  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            <Skeleton className="h-4 w-20" />
          </CardTitle>
          <Skeleton className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-7 w-16 mb-1" />
          <Skeleton className="h-3 w-24" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function TddfAnalyticsSummary({ 
  files, 
  loading = false, 
  className = '',
  variant = 'full'
}: TddfAnalyticsSummaryProps) {
  
  const analytics = React.useMemo(() => {
    if (loading || !files.length) return null;
    return calculateTddfAnalytics(files);
  }, [files, loading]);

  const cards = React.useMemo(() => {
    if (!analytics) return [];

    const baseCards = [
      {
        title: "Total Files",
        value: analytics.totalFiles,
        subtitle: `${analytics.totalFiles} processed`,
        icon: <FileText className="h-4 w-4 text-muted-foreground" />
      },
      {
        title: "Total Data Volume", 
        value: formatFileSize(analytics.totalDataVolume),
        subtitle: `Across ${analytics.totalFiles} files`,
        icon: <Database className="h-4 w-4 text-muted-foreground" />
      },
      {
        title: "Total Records",
        value: analytics.totalRecords.toLocaleString(),
        subtitle: `${analytics.totalProcessedRecords.toLocaleString()} processed`,
        icon: <Activity className="h-4 w-4 text-muted-foreground" />
      },
      {
        title: "Average File Size",
        value: formatFileSize(analytics.averageFileSize),
        subtitle: "Per file average",
        icon: <TrendingUp className="h-4 w-4 text-muted-foreground" />
      }
    ];

    if (variant === 'full') {
      baseCards.push(
        {
          title: "Success Rate",
          value: `${analytics.successRate.toFixed(1)}%`,
          subtitle: `${analytics.totalProcessedRecords.toLocaleString()} of ${analytics.totalRecords.toLocaleString()}`,
          icon: <CheckCircle className="h-4 w-4 text-green-600" />
        },
        {
          title: "Error Rate",
          value: `${analytics.errorRate.toFixed(1)}%`,
          subtitle: analytics.totalErrorRecords > 0 ? `${analytics.totalErrorRecords} errors` : "No errors",
          icon: <AlertTriangle className={`h-4 w-4 ${analytics.totalErrorRecords > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
        }
      );
    }

    return baseCards;
  }, [analytics, variant]);

  return (
    <div className={`grid gap-4 ${variant === 'compact' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'} ${className}`}>
      {loading ? (
        // Show skeletons while loading
        Array.from({ length: variant === 'compact' ? 4 : 6 }).map((_, i) => (
          <AnalyticsCard
            key={i}
            title=""
            value=""
            icon={<></>}
            loading={true}
          />
        ))
      ) : (
        // Show actual analytics cards
        cards.map((card, index) => (
          <AnalyticsCard
            key={index}
            title={card.title}
            value={card.value}
            subtitle={card.subtitle}
            icon={card.icon}
            loading={false}
          />
        ))
      )}
    </div>
  );
}