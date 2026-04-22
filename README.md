# Beauty Detective - Skin Logic AI Audit Engine

## The mission

In an era of "Skin-fluencers" and complex marketing jargon, consumers are often misled by bold brand claims. Beauty Detective was created to democratize cosmetic chemistry. It is an AI-powered tool that translates dense, intimidating ingredient lists into plain language, specifically designed to help users verify if a product’s **Marketing Claims** actually match its **Formula Reality**.

--- 

## Tech Stack

- **Mobile**: Expo + React Native + TypeScript
- **BE**: Node.js + Express
- **AI & LLM**: Google Gemini API + Cursor (AI-Native IDE)

---

## The Problems
Based on qualitative insights, I synthesized the primary user frictions that this product aims to solve.
### Persona A - The Skeptical Shopper
Focus: Anti-aging & Skincare Transparency
- **The Local Barrier**
Struggling to decipher ingredient lists written in German or other foreign languages while shopping.
- **Chemical Confusion** 
Seeing names like "Sodium Hyaluronate" but having no idea what they actually do for the skin.
- **Potency Deception**
Suspecting "hero" ingredients are micro-dosed for marketing hype rather than real results.
- **The "Worth-it" Verdict**
Lacking a professional, jargon-free audit to decide if a product is a waste of money.

### Persona B - The Overwhelmed Optimizer
Focus: Supplements & Daily Wellness
- **Mixing Anxiety**
Fear that combining different supplements will cancel out benefits or cause harm.
- **The "Which Form?" Headache** 
Paralyzed by identical-looking options (like 10 types of Magnesium) with no way to choose.
- **Conflict Uncertainty**
Constant worry about ingredient clashes (e.g., Zinc vs. Magnesium) and side effects.
- **Guidance Gap** 
Taking 5+ daily pills without a smart consultant to optimize the routine.

---

## Solutions - A New Standard for Product Transparency
### 1.Formula Verdict
Applies the "1% Line" Industry Standard—the concentration threshold of preservatives—to audit whether "hero" ingredients are clinically active or micro-dosed for marketing. It provides a "Fair Price" estimate, ensuring users pay for potency, not hype.

### **2.Safety Audit**
Maps ingredients against EU Regulatory Standards to visualize risk distribution. This replaces chemical anxiety with a clear safety score, providing total peace of mind for sensitive users.

### **3.Actionable Insights**
Converts technical data into Instant Directives (e.g., Pregnancy Safety, UV-Warnings). It simplifies complex science into clear "do’s and don’ts" for safe, effective daily use.

### **4.Versus Engine**
A Side-by-Side Comparison Suite that benchmarks competing products' actives and safety profiles. It eliminates choice paralysis by providing a data-backed "Winner" for every shopping dilemma.

---

## The MVP
To maximize impact, I prioritized Single-Product Depth over broad comparison. I focused vertically on High-Stakes Skincare (Creams & Serums) because their high price points and complex actives demand the most rigorous consumer auditing.

**The Prioritization Logic**
- **Foundation First**
 Precise individual analysis is the prerequisite for accurate comparisons; I chose to perfect the "Single Audit" logic first.

- **Engineering Velocity** 
Deferred cross-product comparison to avoid premature complexity in Data Sync and Local Storage.

---

## MVP Features
[点击查看功能演示视频 (demo_bd.mov)](./demo_bd.mov)

---

## Quick Start
### 1. Get Gemini API Key
Apply for an API Key at Google AI Studio.
### 2. Launch Backend API

```bash
cd api
cp .env.example .env   # Edit .env and enter your GEMINI_API_KEY
npm install
npm run dev
```

The API runs by default at http://localhost:3001

### 3. Launch Mobile App

```bash
npm install             # Execute in the root directory
npx expo start --web    # Preview in browser
# OR
npx expo start          # Scan with Expo Go on a physical device
```

### 4. Modify Prompts & JSON Structure
Edit api/prompts.ts to adjust analysis dimensions and response formats.

### 5. API Configuration
The app defaults to http://localhost:3001 during development. If the backend is deployed elsewhere, update API_BASE in services/api.ts.

---

## Project Structure

```
beauty-detective/
├── app/                 # Expo Router
│   ├── _layout.tsx      # Root Layout
│   ├── index.tsx        # Homepage (Shazam-style)
│   ├── report.tsx       # Analysis Report
│   └── assets/          # Icons & Resources
├── services/            # API Calls
├── types/               # Type Definitions
├── api/                 # Backend
│   ├── prompts.ts       # Prompt + JSON Definitions
│   ├── analyze.ts       # Gemini Integration
│   └── server.ts        # Express Server
├── app.json
├── package.json
└── README.md
```

## Environment Variables


| Variable             | Description                       |
| -------------- | ------------------------ |
| GEMINI_API_KEY | Google AI Studio API Key |
| PORT           | API Port (Default: 3001)          |


