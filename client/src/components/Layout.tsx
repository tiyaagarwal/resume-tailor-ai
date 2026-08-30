import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

const navItem =
  'font-mono text-xs uppercase tracking-wider px-3 py-1.5 rounded-md transition-colors';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line bg-paper/90 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <NavLink to="/" className="flex items-baseline gap-2 group">
            <span className="font-display text-xl font-semibold tracking-tight text-ink group-hover:text-press transition-colors">
              ResumeTailor
            </span>
            <span className="font-mono text-[11px] text-seal tracking-widest">AI</span>
          </NavLink>
          <nav className="flex items-center gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `${navItem} ${isActive ? 'bg-press text-white' : 'text-ink-soft hover:bg-ink/5'}`
              }
            >
              New Resume
            </NavLink>
            <NavLink
              to="/history"
              className={({ isActive }) =>
                `${navItem} ${isActive ? 'bg-press text-white' : 'text-ink-soft hover:bg-ink/5'}`
              }
            >
              History
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line py-6">
        <div className="mx-auto max-w-6xl px-6 text-xs font-mono text-ink-faint flex items-center justify-between">
          <span>ResumeTailor AI — every fact traces back to your master resume.</span>
          <span>Always exactly one page</span>
        </div>
      </footer>
    </div>
  );
}
