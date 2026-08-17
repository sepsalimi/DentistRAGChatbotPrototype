// Provides shared product navigation, including the canonical sources route.
import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark">DE</span>
          <span>
            <strong>Dental Evidence</strong>
            <small>Verified answers for care teams</small>
          </span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/">Chat</Link>
          <Link href="/settings/sources">Sources & settings</Link>
          <Link href="/audit">Audit activity</Link>
        </nav>
        <div className="practice-name">
          <span className="status-dot" />
          Northstar Dental
        </div>
      </header>
      {children}
    </div>
  );
}
