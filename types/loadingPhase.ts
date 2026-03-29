export type LoadingPhase =
  | "compressing"
  | "uploading"
  | "classifying"
  | "processing"
  | "finishing";

type PhaseRange = {
  start: number;
  end: number;
};

const PHASE_RANGES: Record<LoadingPhase, PhaseRange> = {
  compressing: { start: 0, end: 20 },
  uploading: { start: 20, end: 40 },
  classifying: { start: 40, end: 68 },
  processing: { start: 68, end: 95 },
  finishing: { start: 95, end: 100 },
};

export function getLoadingPhaseRange(phase: LoadingPhase): PhaseRange {
  return PHASE_RANGES[phase];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function mapPhaseRatioToProgress(
  phase: LoadingPhase,
  ratio: number
): number {
  const range = getLoadingPhaseRange(phase);
  const t = clamp01(ratio);
  return range.start + (range.end - range.start) * t;
}

export function getLoadingPhaseMessage(phase: LoadingPhase): string {
  if (phase === "compressing") return "Compressing image...";
  if (phase === "uploading") return "Uploading image...";
  if (phase === "classifying") {
    return "Your image is a bit tricky, I need to think carefully...";
  }
  if (phase === "processing") return "Processing ingredients...";
  return "Finalizing report...";
}
