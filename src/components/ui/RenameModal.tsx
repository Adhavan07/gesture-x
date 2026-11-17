import React, { useEffect, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { useAppStore } from '../../stores/AppContext.tsx';

export const RenameModal: React.FC = () => {
  const { renameModal, closeRenameModal, renameFile } = useAppStore();
  const [draftName, setDraftName] = useState('');

  useEffect(() => {
    if (renameModal.open) {
      setDraftName(renameModal.currentName);
    }
  }, [renameModal.currentName, renameModal.open]);

  useEffect(() => {
    if (!renameModal.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeRenameModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeRenameModal, renameModal.open]);

  if (!renameModal.open || !renameModal.fileId) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameModal.fileId || !draftName.trim()) return;
    renameFile(renameModal.fileId, draftName);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border border-slate-700 bg-[#0D1628] p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-500/15 text-cyan-300">
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </div>
            <h2
              id="rename-modal-title"
              className="font-display text-base font-semibold text-slate-100"
            >
              Rename Staged File
            </h2>
          </div>
          <button
            type="button"
            onClick={closeRenameModal}
            data-gx-action="rename-cancel"
            data-gx-label="Close Rename"
            aria-label="Close rename modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4">
          <label
            htmlFor="rename-file-input"
            className="block text-xs font-medium text-slate-300"
          >
            File Name
          </label>
          <input
            id="rename-file-input"
            type="text"
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none"
          />
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={closeRenameModal}
            data-gx-action="rename-close"
            data-gx-label="Cancel"
            className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!draftName.trim()}
            data-gx-action="rename-save"
            data-gx-label="Save Name"
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Save Name
          </button>
        </div>
      </form>
    </div>
  );
};
