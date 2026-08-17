// Presents access and answer events from the synthetic audit fixture.
import { auditEvents } from "@/lib/demo-data";

export function AuditActivity() {
  return (
    <section className="audit-card">
      <div className="audit-summary">
        <div><strong>24</strong><span>Answers this week</span></div>
        <div><strong>7</strong><span>Access filters applied</span></div>
        <div><strong>0</strong><span>Policy exceptions</span></div>
      </div>
      <div className="audit-list">
        {auditEvents.map((event) => (
          <article key={event.id}>
            <span className={`event-dot event-${event.outcome}`} />
            <div className="event-main">
              <div>
                <strong>{event.action}</strong>
                <span>{event.target}</span>
              </div>
              <p>{event.detail}</p>
              <small>{event.actor}</small>
            </div>
            <div className="event-outcome">
              <span>{event.outcome}</span>
              <small>{event.time}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
