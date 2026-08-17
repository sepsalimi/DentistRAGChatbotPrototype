// Shows fixture research steps or the backend authorization-first retrieval trace.
import type { DemoAnswer, Persona } from "@/lib/types";

export function ResearchMode({
  answer,
  persona,
}: {
  answer: DemoAnswer;
  persona: Persona;
}) {
  return (
    <section className="research-trace">
      <header>
        <div>
          <span className="eyebrow">{answer.backend ? "Backend retrieval trace" : "Research mode complete"}</span>
          <strong>{answer.backend ? "Authorization-first evidence review" : "Bounded evidence review"}</strong>
        </div>
        <span className="scope-badge">{answer.backend ? `${answer.retrievalMode} mode` : "5 indexed sources max"}</span>
      </header>
      <ol>
        {answer.researchSteps.map((step, index) => (
          <li key={step}>
            <span>{index + 1}</span>
            <div>
              <strong>{step}</strong>
              <small>
                {answer.backend
                  ? `Returned for ${persona === "dentist" ? "user-dentist" : "user-front-desk"}`
                  : step.includes("Filtered") || step.includes("role")
                    ? `Access-filtered for ${persona === "dentist" ? "Dentist" : "Front desk"}`
                    : "Completed from indexed fixtures"}
              </small>
            </div>
          </li>
        ))}
      </ol>
      <footer>
        {answer.backend
          ? "Candidate metadata filtered before authorized content ranking"
          : "No open web search · No autonomous follow-up · Sources limited to this demo workspace"}
      </footer>
    </section>
  );
}
