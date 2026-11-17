import React from 'react';
import { Upload, FolderUp } from 'lucide-react';
import { useAppStore } from '../../stores/AppContext.tsx';
import type { NavTab } from '../../types/app.ts';

const NAV_ITEMS: Array<{ id: NavTab; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'files', label: 'Files' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
];

export const Header: React.FC = () => {
  const {
    activeTab,
    navigate,
    selectedCount,
    files,
    uploadSelectedFiles,
    openFilePicker,
    gestureModeEnabled,
    gesturePaused,
    cameraStatus,
    voiceModeEnabled,
    voiceListeningStatus,
  } = useAppStore();

  const cameraLabel = gestureModeEnabled
    ? gesturePaused
      ? 'Paused'
      : 'Active'
    : cameraStatus === 'denied'
      ? 'Denied'
      : 'Off';

  const voiceLabel = voiceModeEnabled
    ? voiceListeningStatus === 'listening'
      ? 'Listening'
      : 'Ready'
    : 'Off';

  const handlePrimaryClick = () => {
    if (selectedCount > 0) {
      void uploadSelectedFiles();
    } else {
      openFilePicker();
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#070D19]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-8 px-6">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => navigate('dashboard')}
          className="font-display text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400"
        >
          GESTUREX
        </button>

        {/* Zone 2: Navigation Links */}
        <nav
          aria-label="Primary navigation"
          className="flex items-center gap-6 overflow-x-auto"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                data-gx-action={`nav-${item.id}`}
                data-gx-label={item.label}
                className={`relative py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400 ${
                  isActive
                    ? 'text-cyan-300'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {item.label}
                {item.id === 'files' && files.length > 0 ? (
                  <span className="ml-1.5 text-xs font-mono tabular-nums text-slate-400">
                    ({files.length})
                  </span>
                ) : null}
                {isActive ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-cyan-400"
                  />
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Status Readout + Single Primary Action */}
        <div className="flex items-center gap-5 shrink-0">
          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400 whitespace-nowrap shrink-0">
            <span>
              Camera:{' '}
              <strong
                className={
                  gestureModeEnabled && !gesturePaused
                    ? 'font-medium text-cyan-300'
                    : 'font-medium text-slate-200'
                }
              >
                {cameraLabel}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Voice:{' '}
              <strong
                className={
                  voiceModeEnabled
                    ? 'font-medium text-cyan-300'
                    : 'font-medium text-slate-200'
                }
              >
                {voiceLabel}
              </strong>
            </span>
          </div>

          <button
            type="button"
            onClick={handlePrimaryClick}
            data-gx-action="primary-upload"
            data-gx-label={selectedCount > 0 ? 'Upload Selected' : 'Browse Files'}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-500 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
          >
            {selectedCount > 0 ? (
              <>
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Upload Selected ({selectedCount})</span>
              </>
            ) : (
              <>
                <FolderUp className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Browse Files</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
