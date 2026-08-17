// Verifies broad role-aware answers, source identity, exact passages, and access behavior.
import { describe, expect, it } from "vitest";
import { demoAnswers, getAnswer, sampleQuestions, sources } from "./demo-data";
import type { Persona } from "./types";

const roles: Persona[] = ["student", "dentist", "hygienist", "reception"];

describe("demo data", () => {
  it("provides a deterministic distinct answer for every question and role", () => {
    for (const prompt of sampleQuestions) {
      const answers = roles.map((role) => getAnswer(role, prompt));
      expect(answers.map((answer) => answer.persona)).toEqual(roles);
      expect(new Set(answers.map((answer) => answer.answer.join(" "))).size).toBe(roles.length);
      expect(answers.every((answer) => answer.prompt === prompt)).toBe(true);
    }
    expect(demoAnswers).toHaveLength(sampleQuestions.length * roles.length);
  });

  it("keeps the default questions broad rather than patient-centered", () => {
    expect(sampleQuestions).toHaveLength(4);
    expect(sampleQuestions.join(" ")).not.toContain("Maya");
    expect(sampleQuestions.some((question) => question.includes("primary tooth"))).toBe(true);
    expect(sampleQuestions.some((question) => question.includes("estimate"))).toBe(true);
  });

  it("provides exact passage and rich source identity metadata", () => {
    for (const source of sources.filter((item) => item.exactPassage)) {
      expect(source.fullText).toContain(source.exactPassage);
      expect(source.publisher).not.toBe("");
      expect(source.edition).not.toBe("");
      expect(source.section).not.toBe("");
      expect(source.page).not.toBe("");
      expect(source.rights.holder).not.toBe("");
      expect(source.registry.owner).not.toBe("");
    }
  });

  it("demonstrates every planned access scenario", () => {
    const scenarios = new Set(
      sources.flatMap((source) => roles.map((role) => source.access[role]!.scenario)),
    );
    expect(scenarios).toEqual(
      new Set(["public", "licensed-preview", "citation-only", "entitled", "excluded"]),
    );
  });

  it("keeps patient records clinical and benefits guidance administrative", () => {
    const benefits = sources.find((source) => source.id === "benefit-handbook")!;
    const patientChart = sources.find((source) => source.id === "patient-chart")!;

    expect(benefits.access.reception).toMatchObject({
      entitlement: "entitled",
      preview: "full",
      original: "open",
    });
    expect(benefits.access.dentist).toMatchObject({
      entitlement: "not-entitled",
      retrieved: false,
    });
    expect(patientChart.access.dentist?.entitlement).toBe("entitled");
    expect(patientChart.access.hygienist?.entitlement).toBe("entitled");
    expect(patientChart.access.student?.scenario).toBe("excluded");
    expect(patientChart.access.reception?.scenario).toBe("excluded");
  });
});
