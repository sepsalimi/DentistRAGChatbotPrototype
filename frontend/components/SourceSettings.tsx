// Provides the canonical source registry with connection and ingestion entry points.
import Link from "next/link";
import { SourceRegistry } from "./SourceRegistry";

export function SourceSettings() {
  return (
    <main className="standard-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Workspace configuration</span>
          <h1>Source Registry</h1>
          <p>Track source identity, rights, hosting, ingestion state, and role-aware access.</p>
        </div>
        <Link className="primary-button" href="/settings/sources/new">Add source</Link>
      </header>
      <div className="settings-banner">
        <div>
          <strong>Access-aware retrieval is active</strong>
          <span>Source permissions, rights, and entitlements are evaluated before content enters an answer.</span>
        </div>
        <span>Last policy check: Today, 8:44 AM</span>
      </div>
      <SourceRegistry />
    </main>
  );
}
