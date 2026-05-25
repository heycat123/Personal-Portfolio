import { ChevronDown, ChevronRight, Filter, HelpCircle, X } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import EmptyState from './EmptyState';

function columnId(column) {
  return column.id || column.key;
}

function columnHeader(column) {
  return column.header || column.label || columnId(column);
}

function renderCell(column, row) {
  if (column.render) {
    return column.render(row);
  }
  const value = row[column.key || column.id];
  return value === undefined || value === null || value === '' ? '-' : value;
}

function defaultMobileTitle(columns, row) {
  const firstColumn = columns[0];
  if (!firstColumn) {
    return null;
  }
  return renderCell(firstColumn, row);
}

function InfoButton({ label }) {
  if (!label) {
    return null;
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="inline-flex shrink-0 rounded-full text-gray-400 hover:text-sky-700 dark:hover:text-sky-300"
    >
      <HelpCircle size={14} aria-hidden="true" />
    </button>
  );
}

function ColumnHeaderMenu({
  column,
  filterValue,
  isOpen,
  isSorted,
  sortDescending,
  onClearFilter,
  onFilterChange,
  onSetSort,
  onToggle,
}) {
  const id = columnId(column);
  const header = columnHeader(column);
  const canFilter = column.filterable !== false;
  const canSort = column.sortable !== false;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left hover:bg-gray-100 dark:hover:bg-white/10"
        title={`${header} filter and sort`}
      >
        <span className="inline-flex min-w-0 items-center gap-1">
          <span className="truncate">{header}</span>
          <InfoButton label={column.help} />
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-gray-400">
          {filterValue ? <Filter size={13} aria-hidden="true" /> : null}
          {isSorted ? (
            <span className="text-xs font-semibold text-sky-700 dark:text-sky-300">
              {sortDescending ? 'down' : 'up'}
            </span>
          ) : null}
          <ChevronDown size={14} aria-hidden="true" />
        </span>
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-3 text-sm normal-case tracking-normal text-gray-800 shadow-xl dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100">
          {canSort ? (
            <>
              <div className="mb-3 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Sort</div>
              <div className="mb-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onSetSort(id, false)}
                  className={`rounded-md border px-2 py-1.5 text-xs font-semibold ${
                    isSorted && !sortDescending
                      ? 'border-sky-600 bg-sky-50 text-sky-800 dark:border-sky-500 dark:bg-sky-950/50 dark:text-sky-200'
                      : 'border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/10'
                  }`}
                >
                  Ascending
                </button>
                <button
                  type="button"
                  onClick={() => onSetSort(id, true)}
                  className={`rounded-md border px-2 py-1.5 text-xs font-semibold ${
                    isSorted && sortDescending
                      ? 'border-sky-600 bg-sky-50 text-sky-800 dark:border-sky-500 dark:bg-sky-950/50 dark:text-sky-200'
                      : 'border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/10'
                  }`}
                >
                  Descending
                </button>
              </div>
            </>
          ) : null}

          {canFilter ? (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">
                {column.filterLabel || (column.filterType === 'number' ? 'Minimum value' : 'Filter contains')}
              </span>
              <input
                value={filterValue}
                onChange={(event) => onFilterChange(id, event.target.value)}
                type={column.filterType || 'text'}
                min={column.filterType === 'number' ? '0' : undefined}
                max={column.max}
                step={column.step || (column.filterType === 'number' ? '1' : undefined)}
                placeholder={column.placeholder || column.filterPlaceholder}
                className="w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-gray-950 outline-none focus:border-sky-500 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
              />
            </label>
          ) : null}

          <div className="mt-3 flex justify-between gap-2">
            <button
              type="button"
              onClick={() => onClearFilter(id)}
              disabled={!filterValue || !canFilter}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
            >
              Clear filter
            </button>
            <button
              type="button"
              onClick={onToggle}
              className="rounded-md border border-sky-700 bg-sky-700 px-2 py-1.5 text-xs font-semibold text-white hover:bg-sky-800"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function DataTable({
  columns,
  rows,
  rowKey,
  emptyTitle = 'No records found',
  loading = false,
  enableHeaderMenus = false,
  filterValues = {},
  sort = null,
  onFilterChange,
  onClearFilter,
  onSort,
  onClearAllFilters,
  appliedFilters = [],
  sortLabel = null,
  pagination = null,
  renderDetailPanel,
  expandedRows = {},
  onToggleRow,
  selectedRowKey = null,
  onRowSelect,
  mobileTitle,
  mobileSubtitle,
  mobileMetrics,
  mobileActions,
  toolbar,
  tableClassName = '',
}) {
  const [openColumnMenu, setOpenColumnMenu] = useState(null);
  const visibleRows = useMemo(() => rows || [], [rows]);
  const visibleColumns = useMemo(() => columns || [], [columns]);
  const hasRows = visibleRows.length > 0;

  const activeFilterLabels = useMemo(() => {
    if (appliedFilters?.length) {
      return appliedFilters;
    }
    return Object.entries(filterValues || {})
      .filter(([, value]) => String(value || '').trim())
      .map(([key, value]) => ({ id: key, label: `${columnHeader(visibleColumns.find((column) => columnId(column) === key) || { header: key })}: ${value}` }));
  }, [appliedFilters, filterValues, visibleColumns]);

  const getRowKey = (row) => (typeof rowKey === 'function' ? rowKey(row) : row[rowKey]);
  const hasDetailPanel = Boolean(renderDetailPanel);
  const handleRowClick = (event, row) => {
    if (!onRowSelect) {
      return;
    }
    if (event.target.closest('a,button,input,select,textarea,label')) {
      return;
    }
    onRowSelect(row);
  };

  if (!hasRows && !loading) {
    return (
      <div className={tableClassName}>
        {toolbar ? <div className="mb-3">{toolbar}</div> : null}
        <EmptyState title={emptyTitle} />
      </div>
    );
  }

  const renderDesktopHeader = (column) => {
    const id = columnId(column);
    const filterValue = String(filterValues?.[id] ?? '');
    const isSorted = sort?.key === id || sort?.id === id;
    const sortDescending = Boolean(sort?.desc);

    if (!enableHeaderMenus) {
      return (
        <span className="inline-flex min-w-0 items-center gap-1">
          <span className="truncate">{columnHeader(column)}</span>
          <InfoButton label={column.help} />
        </span>
      );
    }

    return (
      <ColumnHeaderMenu
        column={column}
        filterValue={filterValue}
        isOpen={openColumnMenu === id}
        isSorted={isSorted}
        sortDescending={sortDescending}
        onClearFilter={(columnIdValue) => onClearFilter?.(columnIdValue)}
        onFilterChange={(columnIdValue, value) => onFilterChange?.(columnIdValue, value)}
        onSetSort={(columnIdValue, desc) => onSort?.(columnIdValue, desc)}
        onToggle={() => setOpenColumnMenu((current) => (current === id ? null : id))}
      />
    );
  };

  const renderMobileControls = () => {
    if (!enableHeaderMenus) {
      return null;
    }
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-[#101820] lg:hidden">
        <div className="mb-2 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">Sort and filter</div>
        <div className="flex flex-wrap gap-2">
          {visibleColumns.filter((column) => column.mobileFilterHidden !== true).map((column) => {
            const id = columnId(column);
            const filterValue = String(filterValues?.[id] ?? '');
            const isSorted = sort?.key === id || sort?.id === id;
            return (
              <div key={id} className="min-w-[150px] flex-1">
                <ColumnHeaderMenu
                  column={column}
                  filterValue={filterValue}
                  isOpen={openColumnMenu === `mobile_${id}`}
                  isSorted={isSorted}
                  sortDescending={Boolean(sort?.desc)}
                  onClearFilter={(columnIdValue) => onClearFilter?.(columnIdValue)}
                  onFilterChange={(columnIdValue, value) => onFilterChange?.(columnIdValue, value)}
                  onSetSort={(columnIdValue, desc) => onSort?.(columnIdValue, desc)}
                  onToggle={() => setOpenColumnMenu((current) => (current === `mobile_${id}` ? null : `mobile_${id}`))}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderPagination = () => {
    if (!pagination) {
      return null;
    }
    const pageIndex = pagination.pageIndex || 0;
    const pageSize = pagination.pageSize || visibleRows.length || 1;
    const total = pagination.total ?? visibleRows.length;
    const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
    const canGoPrevious = pageIndex > 0;
    const canGoNext = pageIndex + 1 < totalPages;
    const firstVisibleRow = total ? pageIndex * pageSize + 1 : 0;
    const lastVisibleRow = Math.min(total, (pageIndex + 1) * pageSize);
    const pageSizeOptions = pagination.pageSizeOptions || [25, 50, 100];

    return (
      <div className="mt-3 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm dark:border-gray-800 dark:bg-[#101820] dark:text-gray-300 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Showing {firstVisibleRow}-{lastVisibleRow} of {total}; page {pageIndex + 1} of {totalPages}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {pagination.onPageSizeChange ? (
            <select
              value={pageSize}
              onChange={(event) => pagination.onPageSizeChange(Number(event.target.value))}
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-[#0b1117] dark:text-gray-100"
            >
              {pageSizeOptions.map((size) => <option key={size} value={size}>{size} rows</option>)}
            </select>
          ) : null}
          <button
            type="button"
            onClick={() => pagination.onPageChange?.(Math.max(0, pageIndex - 1))}
            disabled={!canGoPrevious || loading}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => pagination.onPageChange?.(pageIndex + 1)}
            disabled={!canGoNext || loading}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-100 dark:hover:bg-white/10"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={tableClassName}>
      {toolbar ? <div className="mb-3">{toolbar}</div> : null}

      {(sortLabel || activeFilterLabels.length) ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {sortLabel ? (
            <span className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-200">
              {sortLabel}
            </span>
          ) : null}
          {activeFilterLabels.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => onClearFilter?.(filter.id)}
              className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-100"
              title="Remove this filter"
            >
              {filter.label}
              <X size={12} aria-hidden="true" />
            </button>
          ))}
          {activeFilterLabels.length && onClearAllFilters ? (
            <button
              type="button"
              onClick={onClearAllFilters}
              className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-[#101820] dark:text-gray-200 dark:hover:bg-white/10"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      {renderMobileControls()}

      <div className="hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#101820] lg:block">
        <div className="max-h-[calc(100vh-260px)] overflow-auto">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:border-gray-800 dark:bg-[#0c1218] dark:text-gray-400">
              <tr>
                {hasDetailPanel ? <th className="w-10 px-2 py-2" /> : null}
                {visibleColumns.map((column) => (
                  <th key={columnId(column)} className={`overflow-hidden px-2 py-2 align-top ${column.headerClassName || ''}`}>
                    {renderDesktopHeader(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {visibleRows.map((row) => {
                const key = getRowKey(row);
                const isExpanded = Boolean(expandedRows[key]);
                const isSelected = selectedRowKey === key;
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={(event) => handleRowClick(event, row)}
                      className={`${isSelected ? 'bg-sky-50/70 dark:bg-sky-950/20' : ''} ${onRowSelect ? 'cursor-pointer' : ''} hover:bg-gray-50 dark:hover:bg-white/[0.03]`}
                    >
                      {hasDetailPanel ? (
                        <td className="px-2 py-2 align-top">
                          <button
                            type="button"
                            onClick={() => onToggleRow?.(row, key)}
                            className="rounded-md p-1 hover:bg-gray-100 dark:hover:bg-white/10"
                            title="Expand row details"
                          >
                            {isExpanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                          </button>
                        </td>
                      ) : null}
                      {visibleColumns.map((column) => (
                        <td key={columnId(column)} className={`overflow-hidden break-words px-3 py-2 align-top text-gray-700 dark:text-gray-300 ${column.className || ''}`}>
                          {renderCell(column, row)}
                        </td>
                      ))}
                    </tr>
                    {hasDetailPanel && isExpanded ? (
                      <tr>
                        <td colSpan={visibleColumns.length + 1} className="bg-gray-50 px-4 py-3 dark:bg-black/20">
                          {renderDetailPanel(row)}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {!visibleRows.length ? (
                <tr>
                  <td colSpan={visibleColumns.length + (hasDetailPanel ? 1 : 0)} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    {emptyTitle}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 space-y-3 lg:hidden">
        {visibleRows.map((row) => {
          const key = getRowKey(row);
          const isExpanded = Boolean(expandedRows[key]);
          const metrics = mobileMetrics ? mobileMetrics(row) : visibleColumns.slice(1).filter((column) => column.mobileHidden !== true);
          return (
            <section
              key={key}
              onClick={(event) => handleRowClick(event, row)}
              className={`rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-[#101820] ${onRowSelect ? 'cursor-pointer' : ''} ${selectedRowKey === key ? 'ring-1 ring-sky-500' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-gray-950 dark:text-white">
                    {mobileTitle ? mobileTitle(row) : defaultMobileTitle(visibleColumns, row)}
                  </div>
                  {mobileSubtitle ? <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{mobileSubtitle(row)}</div> : null}
                </div>
                {mobileActions ? <div className="shrink-0">{mobileActions(row)}</div> : null}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                {metrics.map((column) => (
                  <div key={columnId(column)} className="rounded-md bg-gray-50 p-2 dark:bg-black/20">
                    <div className="text-xs font-semibold uppercase tracking-normal text-gray-500 dark:text-gray-400">{columnHeader(column)}</div>
                    <div className="break-words text-gray-950 dark:text-white">{renderCell(column, row)}</div>
                  </div>
                ))}
              </div>

              {hasDetailPanel ? (
                <>
                  <button
                    type="button"
                    onClick={() => onToggleRow?.(row, key)}
                    className="mt-3 inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/10"
                  >
                    {isExpanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                    Details
                  </button>
                  {isExpanded ? <div className="mt-3">{renderDetailPanel(row)}</div> : null}
                </>
              ) : null}
            </section>
          );
        })}
        {!visibleRows.length ? (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500 shadow-sm dark:border-gray-800 dark:bg-[#101820] dark:text-gray-400">
            {emptyTitle}
          </div>
        ) : null}
      </div>

      {renderPagination()}
    </div>
  );
}
