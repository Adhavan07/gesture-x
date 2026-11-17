import React, { useEffect } from 'react';
import { AppProvider, useAppStore } from './stores/AppContext.tsx';
import { Header } from './components/dashboard/Header.tsx';
import { InteractionPanel } from './components/dashboard/InteractionPanel.tsx';
import { UploadZone } from './components/dashboard/UploadZone.tsx';
import { FileList } from './components/dashboard/FileList.tsx';
import { HistoryView } from './components/dashboard/HistoryView.tsx';
import { SettingsView } from './components/dashboard/SettingsView.tsx';
import { CameraPreview } from './components/gesture/CameraPreview.tsx';
import { GestureEnginePanel } from './components/gesture/GestureEnginePanel.tsx';
import { VirtualCursor } from './components/gesture/VirtualCursor.tsx';
import { VoiceAssistant } from './components/voice/VoiceAssistant.tsx';
import { ConfirmationModal } from './components/ui/ConfirmationModal.tsx';
import { ContextMenu } from './components/ui/ContextMenu.tsx';
import { FilePreviewModal } from './components/ui/FilePreviewModal.tsx';
import { NotificationToast } from './components/ui/NotificationToast.tsx';
import { RenameModal } from './components/ui/RenameModal.tsx';
import { GestureExplorerModal } from './components/ui/GestureExplorerModal.tsx';

const WorkspaceShell: React.FC = () => {
  const {
    activeTab,
    fileInputRef,
    folderInputRef,
    addFiles,
    mountFolderTreeFromEntries,
    selectAllFiles,
    clearSelection,
    openContextMenu,
  } = useAppStore();

  // Global keyboard shortcuts (Ctrl/Cmd+A to select staged files when not typing in an input)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      if (isInput) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAllFiles();
      } else if (e.key === 'Escape') {
        clearSelection();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearSelection, selectAllFiles]);

  const handleFileInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    isFolder = false
  ) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const entries = Array.from(fileList).map((file) => ({
      file,
      relativePath:
        (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
        file.name,
    }));
    if (isFolder) {
      mountFolderTreeFromEntries(entries);
    } else {
      await addFiles(entries);
    }
    e.target.value = '';
  };

  return (
    <div
      onContextMenu={(e) => {
        const target = e.target as HTMLElement | null;
        if (
          target?.tagName === 'INPUT' ||
          target?.tagName === 'TEXTAREA' ||
          target?.tagName === 'SELECT'
        ) {
          return;
        }
        e.preventDefault();
        openContextMenu({
          x: e.clientX,
          y: e.clientY,
          targetType: 'workspace',
          targetId: null,
          label: 'Workspace',
        });
      }}
      className="min-h-screen bg-[#070D19] text-slate-100"
    >
      {/* Hidden native inputs for file & folder access */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={(e) => void handleFileInputChange(e, false)}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        onChange={(e) => void handleFileInputChange(e, true)}
        className="hidden"
      />

      <Header />

      <main className="mx-auto max-w-[1440px] space-y-6 px-6 py-6">
        {activeTab === 'dashboard' ? (
          <>
            <InteractionPanel />
            <GestureEnginePanel />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
              <div className="space-y-6 lg:col-span-8">
                <UploadZone />
                <FileList />
              </div>
              <div className="lg:col-span-4 lg:sticky lg:top-22">
                <VoiceAssistant />
              </div>
            </div>
          </>
        ) : activeTab === 'files' ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
            <div className="space-y-6 lg:col-span-8">
              <UploadZone />
              <FileList />
            </div>
            <div className="lg:col-span-4 lg:sticky lg:top-22">
              <VoiceAssistant />
            </div>
          </div>
        ) : activeTab === 'history' ? (
          <HistoryView />
        ) : (
          <SettingsView />
        )}
      </main>

      <CameraPreview />
      <VirtualCursor />
      <ContextMenu />
      <GestureExplorerModal />
      <FilePreviewModal />
      <RenameModal />
      <ConfirmationModal />
      <NotificationToast />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <WorkspaceShell />
    </AppProvider>
  );
}
