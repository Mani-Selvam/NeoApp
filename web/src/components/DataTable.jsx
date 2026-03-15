import { useEffect, useMemo, useState } from "react";

export default function DataTable({
  columns,
  rows,
  pageSize = 8,
  showPagination = true,
  emptyMessage = "No data found",
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const visibleRows = useMemo(() => {
    if (!showPagination) return rows;
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize, showPagination]);

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="table-empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            visibleRows.map((row, idx) => (
              <tr key={row.id || idx}>
                {columns.map((col) => {
                  const value = row[col.key];
                  return (
                    <td key={col.key} data-label={col.label}>
                      {typeof col.render === "function" ? col.render(value, row) : value}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {showPagination && rows.length > 0 ? (
        <div className="table-pagination">
          <p>
            Showing <strong>{visibleRows.length}</strong> of <strong>{rows.length}</strong>
          </p>
          <div>
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              Previous
            </button>
            <span>
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
