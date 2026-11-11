# SPEC.md — BudgetApp2025 Official Specification (Pullboard Harness)

> **Pullboard Specification Document**  
> This document defines the authoritative feature specifications and acceptance criteria for **BudgetApp2025**. Under the Pullboard workflow, every work item must reference a `SPEC-*` identifier and pass second-verifier acceptance checks before shipping.

---

## SPEC-01: Philippine Bank Account Dashboard & Passbook (*Libreta*)
- **Scope**: `account-dashboard` (`AccountDashboardTab`, `AccountCustomizeModal`)
- **Requirements**:
  1. Every user sees their personalized Account Dashboard with Total Balance, Total Money In, Total Money Out, and Net Cash Flow.
  2. Clicking any bank card opens a senior-friendly **Bank Passbook (*Libreta*) Modal** displaying Money In (`+`), Money Out (`−`), and Running Balance (`Balanse`).
  3. Account cards and Passbook headers use **solid background colors only** (no CSS gradients) and support custom solid color pickers and uploaded bank logo images (`PNG`, `JPG`, `SVG`, `WebP`).

## SPEC-02: Cyber Security, App Vault PIN & Honeynet Deception Center
- **Scope**: `security` (`SecurityCenterTab`, `AppVaultLockOverlay`, `/api/honeypot.js`)
- **Requirements**:
  1. Full-screen **App Vault PIN Lock** (SHA-256 salted PIN hash) with 5-attempt brute-force cooldown and **Duress Honey-PIN** that unlocks silently into Decoy/Fake Wealth Mode.
  2. **5 Active Honeypot & Honeynet Sensors**: Serverless Recon endpoints (`/.env`, `/api/debug-env`, `/api/v1/export-db`, `/admin-backup.sql`), Canary Bank Account (`BPI Executive Reserve ••9941`), Duress Honey-PIN, Login Bot Honeypot (`Auth.jsx`), and LocalStorage Honey-Token (`bujdet_master_api_secret_canary`).
  3. **Intruder Telemetry & Official Reporting**: Captures Intruder IP, Geo-Location, and Browser User-Agent; provides IP Blocklist countermeasures and generates printable PDF reports, CERT-PH / NPC / PNP-ACG abuse complaints, and CSV/JSON forensic exports.

## SPEC-03: Pullboard Spec-Driven Workflow & Adversarial Verification
- **Scope**: `pullboard` (`PullboardTab`, `SPEC.md`, `DOCTRINE.md`, `mcp/core.js`)
- **Requirements**:
  1. 4-Lane Spec-Driven Board: `Backlog` -> `Claimed Lane (In Progress)` -> `Adversarial Verification` -> `Verified & Shipped`.
  2. **Second-Agent Verification Rule**: An item in `Adversarial Verification` cannot move to `Verified & Shipped` until all Acceptance Criteria are checked off by an independent verifier role and the **Quality Gate Runner** passes.
  3. **Shouts & Escalations**: Built-in communication channel for broadcasting agent/auditor shouts and resolving human escalations.

## SPEC-04: Bi-Monthly Payroll Budget, Reconcile & Debt/Goal Tracking
- **Scope**: `dashboard`, `budget`, `reconcile`, `transactions`, `debts`, `credits`, `expenses`, `investments`, `calendar`, `reports`
- **Requirements**:
  1. Supports Philippine 5th and 20th payroll cycles, overtime calculations, credit card & installment tracking, and multi-user Supabase cloud sync with offline `localStorage` fallback.
  2. Preserves strict RBAC (`admin`, `user`, `viewer`, `guest`) and Super Admin protection.

