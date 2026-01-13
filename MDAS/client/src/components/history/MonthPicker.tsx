import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

interface MonthPickerProps {
  currentDate: Date;
  onMonthSelect: (year: number, month: number) => void;
  isDarkMode?: boolean;
}

export function MonthPicker({ currentDate, onMonthSelect, isDarkMode = false }: MonthPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  const handleMonthClick = (monthIndex: number) => {
    onMonthSelect(selectedYear, monthIndex + 1);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={isDarkMode ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : ''}
          data-testid="button-month-picker"
        >
          <CalendarIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className={`sm:max-w-[425px] ${isDarkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
        <DialogHeader>
          <DialogTitle className={isDarkMode ? 'text-white' : ''}>Select Month</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Year Selector */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedYear(selectedYear - 1)}
              className={isDarkMode ? 'bg-gray-700 border-gray-600' : ''}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className={`px-4 py-2 rounded-md border ${
                isDarkMode 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300'
              }`}
              data-testid="select-year"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSelectedYear(selectedYear + 1)}
              className={isDarkMode ? 'bg-gray-700 border-gray-600' : ''}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Month Grid */}
          <div className="grid grid-cols-3 gap-2">
            {months.map((month, index) => {
              const isCurrentMonth = 
                selectedYear === currentDate.getFullYear() && 
                index === currentDate.getMonth();
              
              return (
                <Button
                  key={month}
                  variant={isCurrentMonth ? 'default' : 'outline'}
                  className={`h-12 ${
                    isDarkMode && !isCurrentMonth
                      ? 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                      : ''
                  }`}
                  onClick={() => handleMonthClick(index)}
                  data-testid={`button-month-${month.toLowerCase()}`}
                >
                  {month.substring(0, 3)}
                </Button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
