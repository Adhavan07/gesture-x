import React, { useState } from 'react';
import { RefreshCw, Trash2, Search, CheckCircle2, HardDrive } from 'lucide-react';
import { useAppStore } from '../../stores/AppContext.tsx';
import { formatBytes } from '../../utils/fileValidation.ts';

export const HistoryView: React.FC = () => {
  const {
    uploadHistory,
    storageStats,
    historyLoading,
    refreshHistory,
    deleteHistoryRecord,
    navigate,
  } = useAppStore();

  const [query, setQuery] = useState('');

  const filtered = uploadHistory.filter((rec) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      rec.originalName.toLowerCase().includes(q) ||
      rec.extension.toLowerCase().includes(q) ||
      (rec.folderName && rec.folderName.toLowerCase().includes(q))
    );
  });

  return (
    <section aria-label="Upload History" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-100">
            Upload History
          </h1>
          <p className="mt-1 text-xs text-slate-400 font-mono tabular-nums">
            {storageStats.totalFiles} stored file(s) ·{' '}
            {formatBytes(storageStats.totalBytes)} local storage used
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search uploaded files..."
              aria-label="Search uploaded files"
              className="w-56 rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => void refreshHistory()}
            disabled={historyLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${historyLoading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {historyLoading && uploadHistory.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="h-12 animate-pulse rounded-lg border border-slate-800 bg-slate-900/60"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-[#0D1628]/60 px-6 py-16 text-center">
          <HardDrive className="h-8 w-8 text-slate-500" aria-hidden="true" />
          <h2 className="mt-3 font-display text-sm font-semibold text-slate-200">
            {uploadHistory.length === 0
              ? 'No files uploaded yet'
              : 'No matching upload records'}
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {uploadHistory.length === 0
              ? 'Upload files from the Dashboard or Files view to see persisted records here.'
              : 'Try a different filename or extension filter.'}
          </p>
          {uploadHistory.length === 0 ? (
            <button
              type="button"
              onClick={() => navigate('dashboard')}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
            >
              Go to Dashboard
            </button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0D1628]/80">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="px-4 py-3 font-medium">File Name</th>
                <th className="px-4 py-3 font-medium">Path / Folder</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 text-right font-medium">Size</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Uploaded</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filtered.map((rec) => (
                <tr key={rec.id} className="hover:bg-slate-900/60">
                  <td className="max-w-[240px] truncate px-4 py-3 font-medium text-slate-100">
                    {rec.originalName}
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-slate-400">
                    {rec.folderName || 'Root'}
                  </td>
                  <td className="px-4 py-3 font-mono uppercase text-slate-300">
                    {rec.extension}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-300">
                    {formatBytes(rec.size)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Uploaded</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-slate-400">
                    {new Date(rec.uploadedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      aria-label={`Delete ${rec.originalName}`}
                      onClick={() => void deleteHistoryRecord(rec.id)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
