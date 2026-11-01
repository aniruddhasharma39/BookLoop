import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import './Pagination.css';

export default function Pagination({
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 12,
  onPageChange,
  itemName = 'items',
}) {
  if (totalPages <= 1 && totalItems <= pageSize) {
    return null;
  }

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers with ellipsis
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      let start = Math.max(1, currentPage - 1);
      let end = Math.min(totalPages, currentPage + 1);

      if (currentPage <= 2) {
        start = 1;
        end = 3;
      } else if (currentPage >= totalPages - 1) {
        start = totalPages - 2;
        end = totalPages;
      }

      if (start > 1) {
        pages.push(1);
        if (start > 2) pages.push('...');
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < totalPages) {
        if (end < totalPages - 1) pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const handlePageClick = (page) => {
    if (page === '...' || page === currentPage || page < 1 || page > totalPages) {
      return;
    }
    onPageChange(page);
  };

  return (
    <nav className="bookloop-pagination" aria-label="Pagination Navigation">
      <div className="bookloop-pagination__info">
        Showing <strong>{startItem}–{endItem}</strong> of <strong>{totalItems}</strong> {itemName}
      </div>

      <div className="bookloop-pagination__controls">
        {/* First Page */}
        <button
          type="button"
          className="bookloop-pagination__btn bookloop-pagination__btn--nav"
          disabled={currentPage === 1}
          onClick={() => handlePageClick(1)}
          aria-label="Go to first page"
          title="First page"
        >
          <ChevronsLeft size={16} />
        </button>

        {/* Previous Page */}
        <button
          type="button"
          className="bookloop-pagination__btn bookloop-pagination__btn--nav"
          disabled={currentPage === 1}
          onClick={() => handlePageClick(currentPage - 1)}
          aria-label="Go to previous page"
          title="Previous page"
        >
          <ChevronLeft size={16} />
        </button>

        {/* Page Numbers */}
        <div className="bookloop-pagination__pages">
          {getPageNumbers().map((page, idx) => {
            if (page === '...') {
              return (
                <span key={`ellipsis-${idx}`} className="bookloop-pagination__ellipsis">
                  &hellip;
                </span>
              );
            }

            const isActive = page === currentPage;
            return (
              <button
                key={`page-${page}`}
                type="button"
                className={`bookloop-pagination__btn ${isActive ? 'bookloop-pagination__btn--active' : ''}`}
                onClick={() => handlePageClick(page)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={`Page ${page}`}
              >
                {page}
              </button>
            );
          })}
        </div>

        {/* Next Page */}
        <button
          type="button"
          className="bookloop-pagination__btn bookloop-pagination__btn--nav"
          disabled={currentPage === totalPages}
          onClick={() => handlePageClick(currentPage + 1)}
          aria-label="Go to next page"
          title="Next page"
        >
          <ChevronRight size={16} />
        </button>

        {/* Last Page */}
        <button
          type="button"
          className="bookloop-pagination__btn bookloop-pagination__btn--nav"
          disabled={currentPage === totalPages}
          onClick={() => handlePageClick(totalPages)}
          aria-label="Go to last page"
          title="Last page"
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </nav>
  );
}

