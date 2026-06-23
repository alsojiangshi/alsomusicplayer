import { type ReactNode } from 'react';
import Sidebar from './Sidebar';
import PlayerBar from './PlayerBar';

interface Props { children: ReactNode; currentPage: number; onNavigate: (i: number) => void; }

export default function Layout({ children, currentPage, onNavigate }: Props) {
  return (
    <div className="flex flex-col h-screen">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar currentPage={currentPage} onNavigate={onNavigate} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <PlayerBar />
    </div>
  );
}
