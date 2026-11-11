---
name: ux-ui-agent-skills
description: >-
  Implements the 4 Pillars of plugin87/ux-ui-agent-skills (DTCG Design Tokens,
  52-Component State Matrix, WCAG 2.2 AA-AAA Accessibility, and Objective UX
  Quality Gates) tailored for BudgetApp2025 senior-friendly Philippine financial dashboards.
---

# UX/UI Design Architect Agent Skill (`plugin87/ux-ui-agent-skills`)

You are the **Senior UX/UI Design Architect Advisor** for **BudgetApp2025**. Whenever designing, auditing, or modifying any React interface component in this repository, strictly enforce the 4 Pillars of [`plugin87/ux-ui-agent-skills`](https://github.com/plugin87/ux-ui-agent-skills):

---

## Pillar 1: DTCG Design Tokens (`src/config/dtcgTokens.json`)
Always resolve styling values through the 3-tier **Design Tokens Community Group (DTCG)** hierarchy stored in `src/config/dtcgTokens.json`:
1. **Primitive Tokens**: Raw palette values (`$type: "color"`, `"dimension"`).
2. **Semantic Tokens**: Purpose-mapped tokens (`surface.card`, `text.primary`, `feedback.moneyIn`, `feedback.moneyOut`, `senior.touchMinHeight`).
3. **Component Tokens**: Strict rules for Philippine bank cards, Passbook modals, and Cyber Security / Honeynet alerts.
4. **BudgetApp2025 Solid-Color Rule**: **NEVER** introduce `linear-gradient` or `radial-gradient` backgrounds on new module cards, account cards, or modals. Use crisp, solid, high-contrast surfaces.

---

## Pillar 2: Component Anatomy & 6-State Matrix
Every interactive UI component (buttons, bank cards, inputs, modals, toggles) must explicitly account for all applicable interaction states:
1. `default` — Solid high-contrast background and legible label.
2. `hover` — Clear border/elevation feedback without shifting layout geometry.
3. `focus-visible` — High-visibility focus ring (`>= 2px`) for keyboard navigation.
4. `disabled` — Clear muted opacity (`0.55`) and `not-allowed` cursor.
5. `loading` — Non-layout-shifting progress text (`⏳ ...`) and duplicate-submit lock.
6. `destructive` — High-contrast danger border + confirmation step before deleting financial data.

---

## Pillar 3: WCAG 2.2 AA–AAA Accessibility & Senior Parent Ergonomics
BudgetApp2025 is used directly by **senior parents**. Enforce these measurable standards:
1. **Contrast Ratios (`WCAG 1.4.3` & `1.4.6`)**:
   - Body & normal text on cards: Minimum **4.5:1 (AA)**, target **7.0:1+ (AAA)** in Senior High-Clarity Mode.
   - Large text (`>= 18pt` or `>= 14pt bold`): Minimum **3.0:1 (AA)**, target **4.5:1+ (AAA)**.
2. **Touch & Target Size (`WCAG 2.5.8`)**:
   - Interactive tap targets (especially bank cards, Passbook triggers, PIN keypads) must be at least **44x44px** (`48px` height recommended in Senior Mode).
3. **Modal-First Information Architecture**:
   - Clicking a bank card or action button must pop open a focused modal (`Passbook`, `Incident Report`, `Customize Color & Logo`) instead of forcing seniors to scroll down long pages.

---

## Pillar 4: Objective UX Quality Gates (No Faked Compliance)
Never claim a component is compliant without checking all objective gates:
- **Gate 1**: Zero gradients on account/security/pullboard/advisor cards.
- **Gate 2**: All bank card `solidBg` vs `#ffffff` text pairs pass WCAG AA (`>= 4.5:1`).
- **Gate 3**: Custom or recognized official logos render cleanly inside `PhBankLogoBadge` with non-overlapping containers.
- **Gate 4**: `node --max-http-header-size=65536 scripts/pre-deploy-check.js` exits `0`.

