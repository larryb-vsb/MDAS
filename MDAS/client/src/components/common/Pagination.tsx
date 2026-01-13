import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showBoundaryButtons?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  showBoundaryButtons = true,
}: PaginationProps) {
  // Generate page numbers to display
  const generatePageNumbers = () => {
    const delta = 2; // Number of pages to show before and after current page
    const range = [];
    const rangeWithDots = [];
    let l;

    // Generate basic range
    for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
      range.push(i);
    }

    // Add first and last page plus dots if needed
    if (range.length > 0) {
      // Add dots before if needed
      if (range[0] > 2) {
        rangeWithDots.push("...");
      }

      // Add all pages in range
      for (let i of range) {
        rangeWithDots.push(i);
      }

      // Add dots after if needed
      if (range[range.length - 1] < totalPages - 1) {
        rangeWithDots.push("...");
      }
    }

    return rangeWithDots;
  };

  // Handle page changes
  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    onPageChange(page);
  };

  if (totalPages <= 1) return null;

  const pageNumbers = generatePageNumbers();

  return (
    <div className="flex items-center space-x-2">
      {showBoundaryButtons && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => handlePageChange(1)}
          disabled={currentPage === 1}
          aria-label="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
      )}
      <Button
        variant="outline"
        size="icon"
        onClick={() => handlePageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {/* Always show first page */}
      <Button
        variant={currentPage === 1 ? "default" : "outline"}
        size="icon"
        onClick={() => handlePageChange(1)}
        aria-label="Page 1"
        aria-current={currentPage === 1 ? "page" : undefined}
      >
        1
      </Button>

      {/* Display page numbers */}
      {pageNumbers.map((page, index) => {
        if (page === "...") {
          return (
            <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
              ...
            </span>
          );
        }
        return (
          <Button
            key={`page-${page}`}
            variant={currentPage === page ? "default" : "outline"}
            size="icon"
            onClick={() => handlePageChange(Number(page))}
            aria-label={`Page ${page}`}
            aria-current={currentPage === page ? "page" : undefined}
          >
            {page}
          </Button>
        );
      })}

      {/* Always show last page if there's more than 1 page */}
      {totalPages > 1 && (
        <Button
          variant={currentPage === totalPages ? "default" : "outline"}
          size="icon"
          onClick={() => handlePageChange(totalPages)}
          aria-label={`Page ${totalPages}`}
          aria-current={currentPage === totalPages ? "page" : undefined}
        >
          {totalPages}
        </Button>
      )}

      <Button
        variant="outline"
        size="icon"
        onClick={() => handlePageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      {showBoundaryButtons && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => handlePageChange(totalPages)}
          disabled={currentPage === totalPages}
          aria-label="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}