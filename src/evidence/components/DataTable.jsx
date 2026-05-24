import EmptyState from './EmptyState';

export default function DataTable({ columns, rows, rowKey, emptyTitle = 'No records found' }) {
  if (!rows?.length) {
    return <EmptyState title={emptyTitle} />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-[#101820]">
      <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-gray-800">
        <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-normal text-gray-500 dark:bg-[#0c1218] dark:text-gray-400">
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={`px-4 py-3 ${column.headerClassName || ''}`}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)} className="hover:bg-gray-50 dark:hover:bg-white/[0.03]">
              {columns.map((column) => (
                <td key={column.key} className={`px-4 py-3 align-top ${column.className || ''}`}>
                  {column.render ? column.render(row, index) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
