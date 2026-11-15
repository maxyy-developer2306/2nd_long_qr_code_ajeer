import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { removeToken } from '../services/authService';
import { deletePermit, getPermits, updatePermit } from '../services/permitService';

// Number of rows shown per page (keeps the DOM small and fast)
const PAGE_SIZE = 20;

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
];

// Shared button styles (slim, Vercel/GitHub dark look)
const btnBase =
  'inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50';
const btnPrimary = `${btnBase} bg-white text-black hover:bg-neutral-200`;
const btnGhost = `${btnBase} border border-neutral-800 bg-black text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900 hover:text-white`;
const rowAction =
  'cursor-pointer rounded px-2 py-1 text-xs font-medium text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500';

// Single table row. React.memo prevents re-rendering unchanged rows
// when the user types in the search box or another row changes.
const PermitRow = memo(function PermitRow({ permit, onView, onEdit, onToggle, onDelete }) {
  const initial = (permit.worker_name || '?').trim().charAt(0).toUpperCase();

  return (
    <tr className="transition-colors hover:bg-neutral-900/60">
      <td className="px-4 py-2.5 font-mono text-xs font-medium text-neutral-100">{permit.permit_no}</td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-[11px] font-semibold text-neutral-300">
            {initial}
          </span>
          <span className="text-[13px] text-neutral-200">{permit.worker_name}</span>
        </div>
      </td>
      <td className="px-4 py-2.5 font-mono text-xs text-neutral-400">{permit.iqama_no}</td>
      <td className="px-4 py-2.5 text-[13px] text-neutral-400">{permit.gender || '—'}</td>
      <td className="px-4 py-2.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
            permit.status
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : 'border-amber-500/20 bg-amber-500/10 text-amber-400'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${permit.status ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          {permit.status ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-end gap-0.5">
          <button className={rowAction} onClick={() => onView(permit)}>View</button>
          <button className={rowAction} onClick={() => onEdit(permit)}>Edit</button>
          <button className={rowAction} onClick={() => onToggle(permit)}>
            {permit.status ? 'Deactivate' : 'Activate'}
          </button>
          <button
            className="cursor-pointer rounded px-2 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-red-500"
            onClick={() => onDelete(permit)}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
});

const AdminDashboardPage = () => {
  const navigate = useNavigate();
  const [permits, setPermits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | active | inactive
  const [page, setPage] = useState(1);

  // Search text is deferred so typing stays smooth even with many records
  const deferredQuery = useDeferredValue(query);

  const loadPermits = useCallback(async () => {
    setLoading(true);
    try {
      setPermits(await getPermits());
      setError('');
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Could not load permits.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load once on mount only (no focus listener = no repeated server calls)
  useEffect(() => {
    loadPermits();
  }, [loadPermits]);

  const handleView = useCallback(
    (permit) => window.open(`/Verification_Portal/${permit._id}`, '_blank', 'noopener,noreferrer'),
    []
  );

  const handleEdit = useCallback((permit) => navigate(`/permit-form/${permit._id}`), [navigate]);

  // Optimistic toggle: update UI immediately, roll back if the server fails
  const handleToggle = useCallback(async (permit) => {
    const nextStatus = !permit.status;
    setPermits((prev) => prev.map((p) => (p._id === permit._id ? { ...p, status: nextStatus } : p)));
    try {
      await updatePermit(permit._id, { status: nextStatus });
    } catch (toggleError) {
      setPermits((prev) => prev.map((p) => (p._id === permit._id ? { ...p, status: permit.status } : p)));
      setError(toggleError.response?.data?.message || 'Could not update permit status.');
    }
  }, []);

  // Delete on the server, then remove from local state (no full reload)
  const handleDelete = useCallback(async (permit) => {
    if (!window.confirm(`Delete permit ${permit.permit_no}?`)) return;
    try {
      await deletePermit(permit._id);
      setPermits((prev) => prev.filter((p) => p._id !== permit._id));
    } catch (deleteError) {
      setError(deleteError.response?.data?.message || 'Could not delete permit.');
    }
  }, []);

  const handleLogout = () => {
    removeToken();
    window.location.href = '/login';
  };

  // Summary counts in a single pass
  const { activeCount, inactiveCount } = useMemo(() => {
    let active = 0;
    for (const p of permits) if (p.status) active += 1;
    return { activeCount: active, inactiveCount: permits.length - active };
  }, [permits]);

  // Client-side search + status filter
  const filteredPermits = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return permits.filter((p) => {
      if (statusFilter === 'active' && !p.status) return false;
      if (statusFilter === 'inactive' && p.status) return false;
      if (!q) return true;
      return [p.permit_no, p.worker_name, p.iqama_no]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [permits, deferredQuery, statusFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredPermits.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pagePermits = useMemo(
    () => filteredPermits.slice(pageStart, pageStart + PAGE_SIZE),
    [filteredPermits, pageStart]
  );

  const stats = [
    { label: 'Total permits', value: permits.length, color: 'bg-neutral-400' },
    { label: 'Active', value: activeCount, color: 'bg-emerald-400' },
    { label: 'Inactive', value: inactiveCount, color: 'bg-amber-400' },
  ];

  return (
    <div className="min-h-screen bg-black text-neutral-200 antialiased">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-black">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-[11px] font-bold text-black">A</span>
            <span className="text-[13px] font-semibold text-white">Ajeer</span>
            <span className="text-neutral-700">/</span>
            <span className="text-[13px] text-neutral-400">Permits</span>
          </div>
          <button className={btnGhost} onClick={handleLogout}>Log out</button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Title + primary action */}
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h1 className="m-0 text-xl font-semibold tracking-tight text-white">Permit dashboard</h1>
            <p className="mb-0 mt-1 text-[13px] text-neutral-500">Manage worker permits and their verification status.</p>
          </div>
          <button className={btnPrimary} onClick={() => navigate('/permit-form')}>
            <span aria-hidden="true" className="text-base leading-none">+</span> Add permit
          </button>
        </div>

        {/* Stat cards */}
        <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3.5">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                <span className={`h-1.5 w-1.5 rounded-full ${stat.color}`} />
                {stat.label}
              </div>
              <div className="mt-1.5 text-2xl font-semibold tabular-nums text-white">{stat.value}</div>
            </div>
          ))}
        </section>

        {/* Table card */}
        <section className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 border-b border-neutral-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <svg
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500"
                viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"
              >
                <circle cx="9" cy="9" r="5.5" />
                <path d="M13.5 13.5L17 17" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search permit, worker, iqama..."
                className="h-8 w-full rounded-md border border-neutral-800 bg-black pl-8 pr-3 text-[13px] text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
              />
            </div>

            <div className="flex items-center gap-2">
              {/* Segmented status filter */}
              <div className="inline-flex overflow-hidden rounded-md border border-neutral-800">
                {FILTERS.map((filter) => (
                  <button
                    key={filter.key}
                    onClick={() => {
                      setStatusFilter(filter.key);
                      setPage(1);
                    }}
                    className={`h-8 cursor-pointer px-3 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-neutral-500 ${
                      statusFilter === filter.key
                        ? 'bg-neutral-800 text-white'
                        : 'bg-black text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <button className={btnGhost} onClick={loadPermits} disabled={loading}>
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>

          {error && (
            <p className="m-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-400" role="alert">
              {error}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-neutral-800 bg-black text-[11px] uppercase tracking-wider text-neutral-500">
                  <th className="px-4 py-2.5 font-medium">Permit no.</th>
                  <th className="px-4 py-2.5 font-medium">Worker</th>
                  <th className="px-4 py-2.5 font-medium">Iqama / ID</th>
                  <th className="px-4 py-2.5 font-medium">Gender</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {pagePermits.map((permit) => (
                  <PermitRow
                    key={permit._id}
                    permit={permit}
                    onView={handleView}
                    onEdit={handleEdit}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                  />
                ))}

                {pagePermits.length === 0 && !error && (
                  <tr>
                    <td className="px-6 py-12 text-center text-[13px] text-neutral-500" colSpan="6">
                      {loading
                        ? 'Loading permits...'
                        : permits.length === 0
                          ? 'No permits yet. Click "Add permit" to create the first one.'
                          : 'No permits match your search or filter.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer with pagination */}
          <div className="flex flex-col items-center justify-between gap-3 border-t border-neutral-800 px-4 py-2.5 text-xs text-neutral-500 sm:flex-row">
            <span>
              Showing {filteredPermits.length === 0 ? 0 : pageStart + 1}–{pageStart + pagePermits.length} of{' '}
              {filteredPermits.length} records
              {filteredPermits.length !== permits.length && ` (${permits.length} total)`}
            </span>
            <div className="flex items-center gap-2">
              <button
                className={`${btnGhost} !h-7 !px-2.5 !text-xs`}
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                Previous
              </button>
              <span className="tabular-nums">
                Page {currentPage} / {totalPages}
              </span>
              <button
                className={`${btnGhost} !h-7 !px-2.5 !text-xs`}
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default AdminDashboardPage;