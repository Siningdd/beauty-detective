import type { Category } from "../types/analysis";

export type IntentProductCategory = Exclude<Category, "unknown">;

export type IntentMiniChip = {
  id: string;
  icon: string;
  label: string;
  questions: string[];
};

export const INTENT_MINI_CHIPS: Record<IntentProductCategory, IntentMiniChip[]> = {
  skincare: [
    {
      id: "routine",
      icon: "⚡️",
      label: "Routine",
      questions: [
        "Step-by-step order in my current routine",
        "How to layer with Vitamin C?",
        "Morning or night for best results?",
        "Can I mix this with Retinol or Vitamin C?",
        "Wait time before the next step?",
      ],
    },
    {
      id: "risks",
      icon: "🛡️",
      label: "Risks",
      questions: [
        "Will this cause pilling under makeup?",
        "Signs of irritation I should watch for",
        "Safe for post-laser or post-peel skin?",
        "Which ingredient is most likely to trigger breakouts?",
      ],
    },
    {
      id: "value",
      icon: "💰",
      label: "Value",
      questions: [
        "Is this formula worth the price for my skin goals?",
        "What is the weakest part of this formula?",
        "Any cheaper alternatives with similar function?",
      ],
    },
  ],
  haircare: [
    {
      id: "scalp",
      icon: "💆",
      label: "Scalp",
      questions: [
        "Is this pH-balanced for itchy scalp?",
        "Will it cause long-term build-up?",
        "Safe for daily double-cleansing?",
        "Could this trigger scalp sensitivity over time?",
      ],
    },
    {
      id: "styling",
      icon: "✨",
      label: "Styling",
      questions: [
        "Will this weigh down fine hair?",
        "Will it reduce frizz without making hair greasy?",
        "Best way to combine with heat styling?",
      ],
    },
    {
      id: "frequency",
      icon: "🚿",
      label: "Frequency",
      questions: [
        "How often should I use this per week?",
        "Can I use it daily without over-cleansing?",
        "How to adjust frequency for dyed or damaged hair?",
      ],
    },
  ],
  supplement: [
    {
      id: "absorption",
      icon: "🧪",
      label: "Absorption",
      questions: [
        "Best time to take: empty stomach or with food?",
        "Bioavailability of this specific form",
        "Conflicts with coffee or caffeine?",
        "Should I split dose for better absorption?",
      ],
    },
    {
      id: "conflicts",
      icon: "⚠️",
      label: "Conflicts",
      questions: [
        "Any conflicts with my skincare actives?",
        "Any conflicts with common medications?",
        "What symptoms suggest I should stop taking it?",
      ],
    },
    {
      id: "dosage",
      icon: "📅",
      label: "Dosage",
      questions: [
        "What is a practical daily dosage window?",
        "How long before I should evaluate results?",
        "Is cycling needed to avoid tolerance or side effects?",
      ],
    },
  ],
};
