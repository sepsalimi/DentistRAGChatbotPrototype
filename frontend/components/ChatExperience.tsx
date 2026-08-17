// Coordinates local showcase answers and live access-aware backend streaming.
"use client";

import { FormEvent, useState } from "react";
import {
  applyBackendPreview,
  fetchDocumentPreview,
  fetchSources,
  mapBackendChatResult,
  personaToUserId,
  streamChat,
} from "@/lib/api";
import { getAnswer, patient, showcasePrompts, sources as fixtureSources } from "@/lib/demo-data";
import type { DemoAnswer, EvidenceSource, Persona } from "@/lib/types";
import { ResearchMode } from "./ResearchMode";
import { SourcePanel, type PanelTab } from "./SourcePanel";

const staticDeployment = process.env.NEXT_PUBLIC_STATIC_DEMO === "true";

export function ChatExperience() {
  const [persona, setPersona] = useState<Persona>("dentist");
  const [prompt, setPrompt] = useState(showcasePrompts[0]);
  const [displayedQuestion, setDisplayedQuestion] = useState(showcasePrompts[0]);
  const [input, setInput] = useState("");
  const [researchMode, setResearchMode] = useState(false);
  const [sourcePanelOpen, setSourcePanelOpen] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState("ada-periodontal");
  const [panelTab, setPanelTab] = useState<PanelTab>("sources");
  const [responseMode, setResponseMode] = useState<"showcase" | "backend">("showcase");
  const [liveAnswer, setLiveAnswer] = useState<DemoAnswer | null>(null);
  const [liveSources, setLiveSources] = useState<EvidenceSource[]>([]);
  const [streamedText, setStreamedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const answer = responseMode === "showcase" ? getAnswer(persona, prompt) : liveAnswer;
  const activeSources = responseMode === "showcase" ? fixtureSources : liveSources;

  const selectSource = async (sourceId: string) => {
    setSelectedSourceId(sourceId);
    setPanelTab("sources");
    setSourcePanelOpen(true);
    setPreviewError(null);
    if (responseMode !== "backend") return;

    const source = liveSources.find((item) => item.id === sourceId);
    const policy = source?.access[persona];
    if (!source || !policy || policy.preview === "none" || policy.preview === "metadata-only" || source.excerpt) return;

    setPreviewLoading(true);
    try {
      const preview = await fetchDocumentPreview(sourceId, persona);
      setLiveSources((current) =>
        current.map((item) =>
          item.id === sourceId ? applyBackendPreview(item, preview) : item,
        ),
      );
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Preview request failed.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const askPrompt = (nextPrompt: string) => {
    setResponseMode("showcase");
    setPrompt(nextPrompt);
    setDisplayedQuestion(nextPrompt);
    setInput("");
    setConnectionError(null);
    setStreamedText("");
    setLiveAnswer(null);
    setSourcePanelOpen(false);
  };

  const runLiveQuestion = async (question: string, activePersona: Persona) => {
    setResponseMode("backend");
    setDisplayedQuestion(question);
    setLiveAnswer(null);
    setLiveSources([]);
    setStreamedText("");
    setConnectionError(null);
    setSourcePanelOpen(false);
    setLoading(true);
    try {
      const result = await streamChat(question, activePersona, (token) => {
        setStreamedText((current) => current + token);
      });
      const sourceResults = await fetchSources(activePersona);
      const mapped = mapBackendChatResult(result, question, activePersona);
      const citedById = new Map(mapped.citationSources.map((source) => [source.id, source]));
      const mergedSources = sourceResults.map(
        (source) => citedById.get(source.id) ?? source,
      );
      const knownIds = new Set(mergedSources.map((source) => source.id));
      setLiveSources([
        ...mergedSources,
        ...mapped.citationSources.filter((source) => !knownIds.has(source.id)),
      ]);
      setLiveAnswer(mapped.answer);
      setSelectedSourceId(mapped.answer.citations[0]?.sourceId ?? sourceResults[0]?.id ?? "");
    } catch (error) {
      setConnectionError(
        error instanceof Error
          ? error.message
          : "The backend request failed without an error message.",
      );
    } finally {
      setLoading(false);
    }
  };

  const changePersona = (nextPersona: Persona) => {
    setPersona(nextPersona);
    setPreviewError(null);
    if (responseMode === "backend" && !staticDeployment) {
      void runLiveQuestion(displayedQuestion, nextPersona);
    }
  };

  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    const question = input.trim();
    if (!question) return;
    const matchedPrompt = showcasePrompts.find((item) =>
      item.toLowerCase() === question.toLowerCase(),
    );
    setInput("");
    if (matchedPrompt) {
      askPrompt(matchedPrompt);
      return;
    }
    if (staticDeployment) {
      setResponseMode("backend");
      setDisplayedQuestion(question);
      setLiveAnswer(null);
      setLiveSources([]);
      setStreamedText("");
      setConnectionError(
        "Live RAG requires the FastAPI service and cannot run on GitHub Pages. Choose a seeded showcase prompt to explore the complete evidence UI.",
      );
      setSourcePanelOpen(false);
      return;
    }
    void runLiveQuestion(question, persona);
  };

  return (
    <main className="chat-layout">
      <aside className="chat-sidebar">
        <button className="new-chat" type="button" onClick={() => askPrompt(showcasePrompts[0])}>
          <span>+</span> New conversation
        </button>
        <div className="sidebar-section">
          <span className="sidebar-label">Showcase threads</span>
          {showcasePrompts.map((item) => (
            <button
              className={responseMode === "showcase" && prompt === item ? "active" : ""}
              key={item}
              onClick={() => askPrompt(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        <div className="sidebar-note">
          <strong>{responseMode === "showcase" ? "Showcase mode" : "Backend mode"}</strong>
          <p>
            {responseMode === "showcase"
              ? "Seeded prompts stay local and remain available when the backend is offline."
              : staticDeployment
                ? "GitHub Pages hosts the interactive showcase without the private RAG service."
                : `Live requests use ${personaToUserId(persona)} with backend authorization.`}
          </p>
        </div>
      </aside>

      <section className="conversation">
        <header className="conversation-header">
          <div>
            <span className="eyebrow">Synthetic patient context</span>
            <div className="patient-heading">
              <h1>{patient.name}</h1>
              <span>{patient.id}</span>
              <span>{patient.age} years</span>
            </div>
            <p>
              Last visit {patient.lastVisit}
              {persona === "dentist" ? ` · ${patient.conditions.join(" · ")} · Allergy: ${patient.allergies.join(", ")}` : " · Clinical details restricted by role"}
            </p>
          </div>
          <div className="persona-control">
            <span>Viewing as</span>
            <div>
              <button disabled={loading} className={persona === "dentist" ? "active" : ""} onClick={() => changePersona("dentist")} type="button">
                Dentist
              </button>
              <button disabled={loading} className={persona === "frontDesk" ? "active" : ""} onClick={() => changePersona("frontDesk")} type="button">
                Front desk
              </button>
            </div>
          </div>
        </header>

        <div className="message-scroll">
          <div className="demo-prompts" aria-label="Showcase prompts">
            {showcasePrompts.map((item) => (
              <button key={item} onClick={() => askPrompt(item)} type="button">{item}</button>
            ))}
          </div>

          <div className="message user-message">
            <div className="avatar user-avatar">{persona === "dentist" ? "DR" : "FD"}</div>
            <div>
              <span className="message-author">{persona === "dentist" ? "Dr. Elena Ruiz" : "Jordan Lee"}</span>
              <p>{displayedQuestion}</p>
            </div>
          </div>

          <div className="message assistant-message">
            <div className="avatar assistant-avatar">DE</div>
            <div className="answer-body">
              <div className="answer-heading">
                <div>
                  <span className="message-author">Dental Evidence</span>
                  <small>
                    {responseMode === "showcase"
                      ? "Local deterministic showcase"
                      : staticDeployment
                        ? "GitHub Pages static showcase"
                        : `Backend · ${personaToUserId(persona)}${answer?.retrievalMode ? ` · ${answer.retrievalMode} retrieval` : ""}`}
                  </small>
                </div>
                {answer && (
                  <button className="why-button" onClick={() => {
                    setPanelTab("evidence");
                    setSourcePanelOpen(true);
                  }} type="button">
                    Why this answer
                  </button>
                )}
              </div>
              {loading && (
                <div className="backend-loading" role="status">
                  <strong>Receiving authorized backend answer</strong>
                  <p>{streamedText || "Connecting to the evidence service…"}</p>
                </div>
              )}
              {connectionError && (
                <div className="backend-error" role="alert">
                  <strong>Backend request failed</strong>
                  <p>{connectionError}</p>
                  <span>No fixture answer was substituted. Choose a showcase prompt to use local mode.</span>
                </div>
              )}
              {answer && !loading && !connectionError && (
                <>
                  {answer.answer.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  <div className="citation-row">
                    {answer.citations.map((citation, index) => (
                      <button key={citation.sourceId} onClick={() => selectSource(citation.sourceId)} type="button">
                        <span>{index + 1}</span>{citation.label}
                      </button>
                    ))}
                  </div>
                  <div className="answer-disclaimer">
                    Decision support only. Confirm clinical judgment and current source guidance.
                  </div>
                  {researchMode && <ResearchMode answer={answer} persona={persona} />}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="composer-wrap">
          <div className="research-toggle">
            <button disabled={loading} className={researchMode ? "active" : ""} onClick={() => setResearchMode((value) => !value)} type="button">
              Research mode
            </button>
            <span>{researchMode ? "Bounded review of up to 5 indexed sources" : "Use the quick evidence answer"}</span>
          </div>
          <form className="composer" onSubmit={submitQuestion}>
            <input
              aria-label="Ask Dental Evidence"
              disabled={loading}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about care, evidence, or workflow"
              value={input}
            />
            <button disabled={loading} type="submit">{loading ? "Working" : "Ask"}</button>
          </form>
          <small>
            {responseMode === "showcase"
              ? "Local showcase · Backend not required"
              : staticDeployment
                ? "GitHub Pages · Static showcase deployment"
                : `Backend mode · ${personaToUserId(persona)} · ${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}`}
          </small>
        </div>
      </section>

      {answer && (
        <SourcePanel
          answer={answer}
          sources={activeSources}
          onClose={() => setSourcePanelOpen(false)}
          onSelectSource={selectSource}
          onTabChange={setPanelTab}
          open={sourcePanelOpen}
          tab={panelTab}
          persona={persona}
          previewError={previewError}
          previewLoading={previewLoading}
          selectedSourceId={selectedSourceId}
        />
      )}
      {sourcePanelOpen && <button className="panel-backdrop" aria-label="Close evidence panel" onClick={() => setSourcePanelOpen(false)} type="button" />}
    </main>
  );
}
