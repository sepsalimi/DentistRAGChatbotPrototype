// Verifies deterministic answers and all five explicit source-access behaviors.
import { describe, expect, it } from "vitest";
import { demoAnswers, getAnswer, showcasePrompts, sources } from "./demo-data";

describe("demo data", () => {
  it("provides a distinct answer for every prompt and persona", () => {
    for (const prompt of showcasePrompts) {
      const dentistAnswer = getAnswer("dentist", prompt);
      const frontDeskAnswer = getAnswer("frontDesk", prompt);

      expect(dentistAnswer.persona).toBe("dentist");
      expect(frontDeskAnswer.persona).toBe("frontDesk");
      expect(dentistAnswer.answer).not.toEqual(frontDeskAnswer.answer);
    }

    expect(demoAnswers).toHaveLength(showcasePrompts.length * 2);
  });

  it("demonstrates every planned access scenario", () => {
    const scenarios = new Set(
      sources.flatMap((source) =>
        Object.values(source.access).map((policy) => policy.scenario),
      ),
    );

    expect(scenarios).toEqual(
      new Set(["public", "licensed-preview", "citation-only", "entitled", "excluded"]),
    );
  });

  it("defines preview and original behavior independently", () => {
    const publicSource = sources.find((source) => source.id === "ada-periodontal")!;
    const licensedSource = sources.find((source) => source.id === "practice-protocol")!;
    const citationSource = sources.find((source) => source.id === "antibiotic-note")!;

    expect(publicSource.access.dentist).toMatchObject({
      preview: "full",
      original: "open",
    });
    expect(licensedSource.access.dentist).toMatchObject({
      preview: "watermarked",
      original: "blocked-license",
    });
    expect(citationSource.access.frontDesk).toMatchObject({
      preview: "metadata-only",
      original: "hidden",
    });
  });

  it("enforces persona entitlement and patient chart exclusion", () => {
    const benefits = sources.find((source) => source.id === "benefit-summary")!;
    const patientChart = sources.find((source) => source.id === "patient-chart")!;

    expect(benefits.access.frontDesk).toMatchObject({
      entitlement: "entitled",
      preview: "full",
      original: "open",
    });
    expect(benefits.access.dentist).toMatchObject({
      entitlement: "not-entitled",
      retrieved: false,
      preview: "none",
      original: "blocked-entitlement",
    });
    expect(patientChart.access.dentist).toMatchObject({
      entitlement: "entitled",
      preview: "full",
    });
    expect(patientChart.access.frontDesk).toEqual({
      scenario: "excluded",
      retrieved: false,
      preview: "none",
      original: "hidden",
      entitlement: "not-applicable",
    });
  });
});
