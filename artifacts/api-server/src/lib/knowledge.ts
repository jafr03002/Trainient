import programGeneration from "./knowledge/ti-program-generation.md";
import trainingPrinciples from "./knowledge/ti-training-principles.md";
import checkInEngine from "./knowledge/ti-check-in-engine.md";

export const programGenerationKnowledge = `${trainingPrinciples}\n\n${programGeneration}`;

// The weekly check-in reprogramming reference. Intentionally the ONLY knowledge
// document injected into the check-in adjustment prompt (see routes/checkins.ts) -
// program-generation knowledge is deliberately kept out of that decision so the
// check-in reasons purely from this engine doc plus the client's logged data.
export const checkInEngineKnowledge = checkInEngine;
