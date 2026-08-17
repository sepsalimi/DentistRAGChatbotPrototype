// Hosts the synthetic audit trail for answer and access activity.
import { AuditActivity } from "@/components/AuditActivity";

export default function AuditPage() {
  return (
    <main className="standard-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Workspace governance</span>
          <h1>Audit activity</h1>
          <p>Review how answers used sources, which policies filtered content, and who opened evidence.</p>
        </div>
        <button className="secondary-button" type="button">Export activity</button>
      </header>
      <div className="audit-filterbar">
        <button className="active" type="button">All activity</button>
        <button type="button">Answers</button>
        <button type="button">Access decisions</button>
        <button type="button">Source activity</button>
        <span>Last 7 days</span>
      </div>
      <AuditActivity />
    </main>
  );
}
