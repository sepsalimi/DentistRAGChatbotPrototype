// Provides the reusable source configuration view for settings routes.
import { ConnectorGrid } from "./ConnectorGrid";

export function SourceSettings() {
  return (
    <main className="standard-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Workspace configuration</span>
          <h1>Sources & settings</h1>
          <p>Manage indexed knowledge, sync visibility, and role-aware access for this synthetic workspace.</p>
        </div>
        <button className="primary-button" type="button">Add source</button>
      </header>
      <div className="settings-banner">
        <div>
          <strong>Access-aware retrieval is active</strong>
          <span>Source permissions are evaluated before content enters an answer.</span>
        </div>
        <span>Last policy check: Today, 8:44 AM</span>
      </div>
      <section>
        <div className="section-heading">
          <div>
            <h2>Connected sources</h2>
            <p>Connection tests below are intentionally simulated for this frontend prototype.</p>
          </div>
        </div>
        <ConnectorGrid />
      </section>
    </main>
  );
}
