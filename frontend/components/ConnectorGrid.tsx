// Renders connector health and a transparent simulated connection test.
"use client";

import { useState } from "react";
import { connectors } from "@/lib/demo-data";

export function ConnectorGrid() {
  const [testedConnector, setTestedConnector] = useState<string | null>(null);

  return (
    <div className="connector-grid">
      {connectors.map((connector) => (
        <article className="connector-card" key={connector.id}>
          <header>
            <div className="connector-mark">{connector.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <h3>{connector.name}</h3>
              <span className={`connector-status status-${connector.status}`}>
                {connector.status.replace("-", " ")}
              </span>
            </div>
          </header>
          <p>{connector.description}</p>
          <dl>
            <div>
              <dt>Content</dt>
              <dd>{connector.recordCount}</dd>
            </div>
            <div>
              <dt>Last sync</dt>
              <dd>{connector.lastSync}</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>{connector.accessSummary}</dd>
            </div>
          </dl>
          <button onClick={() => setTestedConnector(connector.id)} type="button">
            Test connection
          </button>
          {testedConnector === connector.id && (
            <div className="connection-result" role="status">
              <strong>Simulation passed</strong>
              <span>Fixture endpoint reachable · Access mapping loaded</span>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
