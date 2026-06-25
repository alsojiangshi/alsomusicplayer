import type { ReactNode } from 'react';
import PlayerBar from './PlayerBar';
import Sidebar from './Sidebar';

interface Props {
  children: ReactNode;
  currentPage: number;
  onNavigate: (index: number) => void;
  onImport: () => void;
  onShowLyrics: () => void;
  onOpenPlaylist: (playlistId: number) => void;
}

export default function Layout({
  children,
  currentPage,
  onNavigate,
  onImport,
  onShowLyrics,
  onOpenPlaylist,
}: Props) {
  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          currentPage={currentPage}
          onNavigate={onNavigate}
          onImport={onImport}
          onOpenPlaylist={onOpenPlaylist}
        />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <PlayerBar onShowLyrics={onShowLyrics} />
    </div>
  );
}
