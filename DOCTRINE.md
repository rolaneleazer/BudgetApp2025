# DOCTRINE.md — BudgetApp2025 House Rules & Quality Gates (Pullboard)

> **Pullboard Doctrine & Invariants**  
> All human operators and AI coding/auditing agents working in **BudgetApp2025** must obey these house rules. Violations block task verification and deployment.

---

## Rule 1: Adversarial Second-Verification ("Nothing Ships Unverified")
- No feature, financial audit task, or code change may transition directly from `Claimed Lane (In Progress)` to `Verified & Shipped`.
- Every item must enter `Adversarial Verification`, where a **different verifier lane** (e.g., `Independent Verifier Agent`, `Financial Auditor`, or `Security Sentinel`) verifies every acceptance criterion and confirms the Quality Gate passes.

## Rule 2: Solid-Color Senior-Friendly Design Policy
- **No Gradient Backgrounds**: Never use `linear-gradient` or `radial-gradient` on account cards, passbook modals, security cards, or Pullboard cards. Always use clean, high-contrast **solid background colors**.
- Maintain large, senior-friendly typography and modal popups so users never have to hunt or scroll down the page after clicking a card.

## Rule 3: Mandatory Quality Gate (`pre-deploy-check`)
- Before any work item is approved in `Adversarial Verification`, the automated Quality Gate must pass:
  ```bash
  node --max-http-header-size=65536 scripts/pre-deploy-check.js
  ```
- This gate verifies:
  1. Vite frontend production compilation (`npm run build`).
  2. MCP server tool registrations (`mcp/core.js`).
  3. Financial & module summary calculations (including empty and populated profiles).
  4. Scheduler rules and timezone checks (`Asia/Manila`).
  5. Super Admin role and RBAC permission invariants.

## Rule 4: Security, Privacy & Honeynet Integrity
- Never commit plaintext `.env` secrets or service-role keys.
- Preserve all 5 Honeynet & Honeypot deception traps, SHA-256 financial integrity sealing, and AES-256-GCM encrypted vault backup capabilities.

## Rule 5: Shouts & Escalations Protocol
- When an agent or auditor encounters an ambiguous requirement, ledger discrepancy, or security anomaly, it must post an **Escalation Shout** rather than guessing silently.
- Open `ESCALATION` shouts block final release until resolved by the System Owner.

