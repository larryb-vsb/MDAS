import React, { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar, TrendingUp, BarChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ActivityData {
  date: string;
  count: number;
}

interface EnhancedActivityHeatMapProps {
  data: ActivityData[];
  title: string;
  description: string;
  onDateSelect?: (date: string) => void;
  selectedDate?: string | null;
  isLoading?: boolean;
  // Performance optimization props
  enableVirtualization?: boolean;
  dataThreshold?: number; // Above this threshold, use performance optimizations
  aggregationLevel?: 'day' | 'week' | 'month';
}

// Performance-optimized heat map for large datasets
function PerformanceHeatMap({ 
  data, 
  selectedYear, 
  onDateSelect, 
  selectedDate,
  aggregationLevel = 'day'
}: {
  data: ActivityData[];
  selectedYear: number;
  onDateSelect?: (date: string) => void;
  selectedDate?: string | null;
  aggregationLevel: 'day' | 'week' | 'month';
}) {
  
  // Memoized data processing for performance
  const processedData = useMemo(() => {
    console.log(`[HEATMAP-PERF] Processing ${data.length} records with ${aggregationLevel} aggregation`);
    const startTime = Date.now();
    
    let aggregatedData: Record<string, number> = {};
    
    if (aggregationLevel === 'week') {
      // Weekly aggregation for very large datasets
      data.forEach(item => {
        if (!item.date) return;
        const date = new Date(item.date);
        if (date.getFullYear() !== selectedYear) return;
        
        // Get week start (Sunday)
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        
        aggregatedData[weekKey] = (aggregatedData[weekKey] || 0) + item.count;
      });
    } else if (aggregationLevel === 'month') {
      // Monthly aggregation for extremely large datasets
      data.forEach(item => {
        if (!item.date) return;
        const date = new Date(item.date);
        if (date.getFullYear() !== selectedYear) return;
        
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
        aggregatedData[monthKey] = (aggregatedData[monthKey] || 0) + item.count;
      });
    } else {
      // Daily aggregation (default)
      data.forEach(item => {
        if (!item.date) return;
        const date = new Date(item.date);
        if (date.getFullYear() !== selectedYear) return;
        
        const dateKey = date.toISOString().split('T')[0];
        aggregatedData[dateKey] = (aggregatedData[dateKey] || 0) + item.count;
      });
    }
    
    const maxCount = Math.max(...Object.values(aggregatedData), 1);
    const totalCount = Object.values(aggregatedData).reduce((sum, count) => sum + count, 0);
    
    const processingTime = Date.now() - startTime;
    console.log(`[HEATMAP-PERF] Data processing completed in ${processingTime}ms (${aggregationLevel} level)`);
    
    return { aggregatedData, maxCount, totalCount, processingTime };
  }, [data, selectedYear, aggregationLevel]);
  
  // Optimized color calculation with memoization
  const getIntensityColor = useCallback((count: number, maxCount: number, isSelected: boolean) => {
    if (isSelected) {
      return 'bg-orange-500 hover:bg-orange-600 ring-2 ring-orange-600 ring-offset-1';
    }
    
    if (count === 0) {
      return 'bg-gray-100 hover:bg-gray-200';
    }
    
    const intensity = count / maxCount;
    
    // Optimized intensity mapping for performance
    if (intensity <= 0.1) return 'bg-green-100 hover:bg-green-200';
    if (intensity <= 0.2) return 'bg-green-200 hover:bg-green-300';
    if (intensity <= 0.4) return 'bg-green-400 hover:bg-green-500';
    if (intensity <= 0.6) return 'bg-blue-500 hover:bg-blue-600';
    if (intensity <= 0.8) return 'bg-blue-700 hover:bg-blue-800';
    return 'bg-purple-800 hover:bg-purple-900';
  }, []);
  
  // Render different views based on aggregation level
  if (aggregationLevel === 'month') {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    return (
      <div className="space-y-4">
        {/* Monthly View Performance Optimized */}
        <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
          {months.map((month, index) => {
            const monthKey = `${selectedYear}-${String(index + 1).padStart(2, '0')}-01`;
            const count = processedData.aggregatedData[monthKey] || 0;
            const intensity = count / processedData.maxCount;
            
            return (
              <div
                key={month}
                className={`
                  relative h-16 rounded-lg border-2 transition-all duration-200 cursor-pointer
                  ${getIntensityColor(count, processedData.maxCount, false)}
                  hover:scale-105 hover:shadow-md
                `}
                title={`${month} ${selectedYear}: ${count.toLocaleString()} transactions`}
                onClick={() => onDateSelect && onDateSelect(monthKey)}
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center text-xs font-medium">
                  <div className="text-gray-700">{month}</div>
                  <div className="text-gray-600">{count > 999 ? `${(count/1000).toFixed(1)}k` : count}</div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Performance Stats */}
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <Badge variant="outline">Monthly View</Badge>
          <span>{processedData.totalCount.toLocaleString()} total transactions</span>
          <span>Peak month: {processedData.maxCount.toLocaleString()}</span>
          <span className="text-xs">Processed in {processedData.processingTime}ms</span>
        </div>
      </div>
    );
  }
  
  if (aggregationLevel === 'week') {
    // Weekly grid view for medium-large datasets
    const weeks = [];
    const startDate = new Date(selectedYear, 0, 1);
    const endDate = new Date(selectedYear, 11, 31);
    let currentWeek = new Date(startDate);
    currentWeek.setDate(currentWeek.getDate() - currentWeek.getDay());
    
    while (currentWeek <= endDate && weeks.length < 53) {
      const weekKey = currentWeek.toISOString().split('T')[0];
      const count = processedData.aggregatedData[weekKey] || 0;
      
      weeks.push({
        weekStart: new Date(currentWeek),
        key: weekKey,
        count: count
      });
      
      currentWeek.setDate(currentWeek.getDate() + 7);
    }
    
    return (
      <div className="space-y-4">
        {/* Weekly Grid */}
        <div className="grid grid-cols-13 gap-1">
          {weeks.map((week, index) => (
            <div
              key={week.key}
              className={`
                w-6 h-6 rounded-sm transition-all duration-200 cursor-pointer
                ${getIntensityColor(week.count, processedData.maxCount, selectedDate === week.key)}
              `}
              title={`Week of ${week.weekStart.toLocaleDateString()}: ${week.count} transactions`}
              onClick={() => onDateSelect && onDateSelect(week.key)}
            />
          ))}
        </div>
        
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <Badge variant="outline">Weekly View</Badge>
          <span>{processedData.totalCount.toLocaleString()} total transactions</span>
          <span>Peak week: {processedData.maxCount.toLocaleString()}</span>
        </div>
      </div>
    );
  }
  
  // Default daily view (original implementation)
  return (
    <div className="text-center text-gray-500 p-4">
      Daily view rendering... (use SimpleActivityHeatMap for daily view)
    </div>
  );
}

export default function EnhancedActivityHeatMap({ 
  data, 
  title, 
  description, 
  onDateSelect, 
  selectedDate,
  isLoading = false,
  enableVirtualization = true,
  dataThreshold = 10000, // Switch to performance mode above 10k records
  aggregationLevel = 'day'
}: EnhancedActivityHeatMapProps) {
  
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  
  // Determine if we need performance optimizations
  const usePerformanceMode = data.length > dataThreshold;
  const optimalAggregation = useMemo(() => {
    if (data.length > 50000) return 'month';
    if (data.length > 20000) return 'week';
    return 'day';
  }, [data.length]);
  
  // Get available years from data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    data.forEach(item => {
      if (item.date) {
        const date = new Date(item.date);
        if (!isNaN(date.getTime())) {
          years.add(date.getFullYear());
        }
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [data]);
  
  // Navigation functions
  const navigateYear = (direction: 'prev' | 'next') => {
    const currentIndex = availableYears.indexOf(selectedYear);
    if (direction === 'prev' && currentIndex < availableYears.length - 1) {
      setSelectedYear(availableYears[currentIndex + 1]);
    } else if (direction === 'next' && currentIndex > 0) {
      setSelectedYear(availableYears[currentIndex - 1]);
    }
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart className="w-5 h-5 animate-pulse" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          {title}
          {usePerformanceMode && (
            <Badge variant="secondary" className="ml-2">
              <TrendingUp className="w-3 h-3 mr-1" />
              Performance Mode
            </Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
        
        {/* Performance Stats */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>{data.length.toLocaleString()} total data points</span>
          <span>Aggregation: {usePerformanceMode ? optimalAggregation : aggregationLevel}</span>
          {usePerformanceMode && <Badge variant="outline" className="text-xs">Auto-optimized</Badge>}
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Year Navigation */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateYear('prev')}
              disabled={availableYears.indexOf(selectedYear) >= availableYears.length - 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium text-lg min-w-[80px] text-center">{selectedYear}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateYear('next')}
              disabled={availableYears.indexOf(selectedYear) <= 0}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Performance Indicator */}
          {usePerformanceMode && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <TrendingUp className="w-4 h-4" />
              <span>Large dataset optimization active</span>
            </div>
          )}
        </div>
        
        {/* Heat Map Visualization */}
        <PerformanceHeatMap
          data={data}
          selectedYear={selectedYear}
          onDateSelect={onDateSelect}
          selectedDate={selectedDate}
          aggregationLevel={usePerformanceMode ? optimalAggregation : aggregationLevel}
        />
      </CardContent>
    </Card>
  );
}