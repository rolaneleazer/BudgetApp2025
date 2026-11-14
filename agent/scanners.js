import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { buildUnifiedDiff, resolveRepoPath, sha256, verifySyntaxWithEsbuild } from "./remediation.js";

const SCAN_ROOTS = ["src", "api", "mcp"];
const EXTRA_SCANNED_FILES = ["scripts/pre-deploy-check.js", "vercel.json", "vite.config.js", "package.json"];
const CODE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".css"]);

const SEVERITY_WEIGHT = {
  CRITICAL: 25,
  HIGH: 12,
  MEDIUM: 5,
  LOW: 2,
};

function makeFindingId(ruleId, filePath, lineStart) {
  return "f_" + crypto.createHash("sha1").update(`${ruleId}|${filePath}|${lineStart}`).digest("hex").slice(0, 12);
}

function getLineSnippet(lines, lineIdx) {
  const start = Math.max(0, lineIdx - 1);
  const end = Math.min(lines.length, lineIdx + 2);
  return lines
    .slice(start, end)
    .map((text, idx) => `${start + idx + 1}: ${text}`)
    .join("\n");
}

function replaceSingleLine(lines, lineIdx, nextLineText) {
  const copy = [...lines];
  copy[lineIdx] = nextLineText;
  return copy.join("\n");
}

/**
 * Scan a single file for syntax errors, SAST security issues, hardcoded secrets,
 * and BudgetApp2025 Doctrine/UX invariants.
 */
export function scanFile(relPath, repoRoot = process.cwd()) {
  const normPath = relPath.replace(/\\/g, "/");
  const absPath = resolveRepoPath(repoRoot, normPath);
  if (!fs.existsSync(absPath)) return [];

  const stat = fs.statSync(absPath);
  if (!stat.isFile()) return [];

  const findings = [];
  const now = new Date().toISOString();
  const content = fs.readFileSync(absPath, "utf8");
  const fileHash = sha256(content);

  // 1. Critical Empty File Check (Doctrine & Integrity)
  const isCriticalSource =
    normPath.startsWith("src/") ||
    normPath.startsWith("api/") ||
    normPath.startsWith("mcp/") ||
    normPath === "scripts/pre-deploy-check.js";

  if (isCriticalSource && content.trim().length === 0) {
    findings.push({
      id: makeFindingId("DOCTRINE-EMPTY-001", normPath, 1),
      ruleId: "DOCTRINE-EMPTY-001",
      cwe: "CWE-665",
      category: "DOCTRINE",
      severity: "CRITICAL",
      title: "Critical module file is empty (0 bytes)",
      description: `${normPath} has no content, which will break builds or disable access-control/application modules.`,
      howToFix: [
        `Restore the last committed version with: git show HEAD:${normPath} > ${normPath}`,
        "Verify compilation and invariants with: npm run pre-deploy-check",
      ],
      filePath: normPath,
      lineStart: 1,
      lineEnd: 1,
      snippet: "(empty file)",
      autoFixable: false,
      fixRisk: "requires-review",
      fixStrategy: "manual",
      proposedAfter: null,
      diff: "",
      fileSha256: fileHash,
      status: "PENDING_REVIEW",
      detectedAt: now,
    });
    return findings;
  }

  const ext = path.extname(normPath).toLowerCase();
  if (!CODE_EXTENSIONS.has(ext)) return findings;

  // 2. Real-time JS/JSX Syntax Check via esbuild
  const syntaxCheck = verifySyntaxWithEsbuild(normPath, content);
  if (!syntaxCheck.ok) {
    findings.push({
      id: makeFindingId("SYNTAX-CHK-001", normPath, 1),
      ruleId: "SYNTAX-CHK-001",
      cwe: "CWE-1126",
      category: "SAST",
      severity: "CRITICAL",
      title: "Syntax / Parse Error Detected",
      description: `esbuild failed to parse ${normPath}: ${syntaxCheck.error}`,
      howToFix: [
        "Inspect the reported line and column in the error message.",
        "Fix any unclosed brackets, JSX tags, or invalid ES module syntax.",
        "Re-save the file; Code Sentinel will verify syntax automatically.",
      ],
      filePath: normPath,
      lineStart: 1,
      lineEnd: 1,
      snippet: syntaxCheck.error,
      autoFixable: false,
      fixRisk: "requires-review",
      fixStrategy: "manual",
      proposedAfter: null,
      diff: "",
      fileSha256: fileHash,
      status: "PENDING_REVIEW",
      detectedAt: now,
    });
  }

  const normalizedContent = content.replace(/\r\n/g, "\n");
  const lines = normalizedContent.split("\n");

  const secretPatterns = [
    { name: "Stripe Live Secret Key", regex: /sk_live_[0-9a-zA-Z]{16,}/ },
    { name: "GitHub Personal Access Token", regex: /ghp_[0-9a-zA-Z]{24,}/ },
    { name: "Google API Key", regex: /AIza[0-9A-Za-z\-_]{25,}/ },
    { name: "Private Key Block", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { name: "Hardcoded Service Role Key", regex: /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["']eyJ[A-Za-z0-9._-]{20,}["']/ },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    const lineNum = i + 1;

    // 3. Hardcoded Secrets Scanner
    for (const sp of secretPatterns) {
      if (sp.regex.test(line)) {
        findings.push({
          id: makeFindingId("SAST-SEC-001", normPath, lineNum),
          ruleId: "SAST-SEC-001",
          cwe: "CWE-798",
          category: "SECRETS",
          severity: "CRITICAL",
          title: `Hardcoded ${sp.name} Detected`,
          description: "Embedded credentials in source code can leak via git history or client bundles.",
          howToFix: [
            "Remove the literal secret from source code immediately.",
            "Store it in `.env` (never committed) and read via `process.env.<KEY_NAME>` on the server only.",
            "Rotate/revoke the exposed credential in the provider dashboard.",
          ],
          filePath: normPath,
          lineStart: lineNum,
          lineEnd: lineNum,
          snippet: getLineSnippet(lines, i),
          autoFixable: false,
          fixRisk: "requires-review",
          fixStrategy: "manual",
          proposedAfter: null,
          diff: "",
          fileSha256: fileHash,
          status: "PENDING_REVIEW",
          detectedAt: now,
        });
      }
    }

    // 4. Dynamic Code Execution / Command Injection
    const hasEval = /\beval\s*\(/.test(line) || /\bnew\s+Function\s*\(/.test(line);
    const hasShellTemplate = /\bexec(?:Sync)?\s*\(\s*`[^`]*\$\{/.test(line);
    if (hasEval || hasShellTemplate) {
      findings.push({
        id: makeFindingId("SAST-INJ-002", normPath, lineNum),
        ruleId: "SAST-INJ-002",
        cwe: hasShellTemplate ? "CWE-78" : "CWE-95",
        category: "SAST",
        severity: "CRITICAL",
        title: hasShellTemplate
          ? "Potential OS Command Injection via Template String"
          : "Unsafe Dynamic Code Execution (eval / new Function)",
        description: hasShellTemplate
          ? "Interpolating variables directly into exec/execSync allows shell injection if inputs are untrusted."
          : "eval() and new Function() execute arbitrary strings as code and expand XSS/RCE blast radius.",
        howToFix: hasShellTemplate
          ? [
              "Replace `execSync(\`cmd ${arg}\`)` with `execFileSync('cmd', [arg])` using an argument array.",
              "Validate/whitelist dynamic arguments with `zod` before passing them to child processes.",
            ]
          : [
              "Replace `eval()` or `new Function()` with structured JSON parsing (`JSON.parse`) or explicit function maps.",
              "Never pass user-controlled or API-sourced strings to code-evaluation APIs.",
            ],
        filePath: normPath,
        lineStart: lineNum,
        lineEnd: lineNum,
        snippet: getLineSnippet(lines, i),
        autoFixable: false,
        fixRisk: "requires-review",
        fixStrategy: "manual",
        proposedAfter: null,
        diff: "",
        fileSha256: fileHash,
        status: "PENDING_REVIEW",
        detectedAt: now,
      });
    }

    // 5. DOM XSS Sinks
    if (/dangerouslySetInnerHTML|\.innerHTML\s*=|\bdocument\.write\s*\(/.test(line)) {
      findings.push({
        id: makeFindingId("SAST-XSS-003", normPath, lineNum),
        ruleId: "SAST-XSS-003",
        cwe: "CWE-79",
        category: "SAST",
        severity: "HIGH",
        title: "Potential DOM Cross-Site Scripting (XSS) Sink",
        description: "Injecting raw HTML strings into the DOM can execute malicious scripts if any substring is attacker-controlled.",
        howToFix: [
          "Render text via React JSX (`{value}`) or `element.textContent` instead of `innerHTML` / `dangerouslySetInnerHTML`.",
          "If rich HTML is strictly required, sanitize first with a strict allowlist sanitizer (e.g., DOMPurify).",
        ],
        filePath: normPath,
        lineStart: lineNum,
        lineEnd: lineNum,
        snippet: getLineSnippet(lines, i),
        autoFixable: false,
        fixRisk: "requires-review",
        fixStrategy: "manual",
        proposedAfter: null,
        diff: "",
        fileSha256: fileHash,
        status: "PENDING_REVIEW",
        detectedAt: now,
      });
    }

    // 6. Reverse Tabnabbing (Auto-fixable!)
    if (
      ext === ".jsx" &&
      /<a\b[^>]*target=["']_blank["']/.test(line) &&
      !/rel=["'][^"']*noopener/.test(line)
    ) {
      const patchedLine = line.replace(/target=(["'])_blank\1/, 'target="_blank" rel="noopener noreferrer"');
      if (patchedLine !== line) {
        const proposedAfter = replaceSingleLine(lines, i, patchedLine);
        findings.push({
          id: makeFindingId("SAST-TABNAB-004", normPath, lineNum),
          ruleId: "SAST-TABNAB-004",
          cwe: "CWE-1022",
          category: "SAST",
          severity: "MEDIUM",
          title: 'External Link target="_blank" Missing rel="noopener noreferrer"',
          description: "Links opening in a new tab without noopener can expose window.opener to the destination page.",
          howToFix: [
            'Add `rel="noopener noreferrer"` to every `<a target="_blank">` element.',
            "Or click Approve & Auto-Fix to patch this attribute safely.",
          ],
          filePath: normPath,
          lineStart: lineNum,
          lineEnd: lineNum,
          snippet: getLineSnippet(lines, i),
          autoFixable: true,
          fixRisk: "safe-autofix",
          fixStrategy: "file-patch",
          proposedAfter,
          diff: buildUnifiedDiff(normalizedContent, proposedAfter, normPath),
          fileSha256: fileHash,
          status: "PENDING_REVIEW",
          detectedAt: now,
        });
      }
    }

    // 7. Cleartext HTTP URL (Auto-fixable!)
    const httpMatch = line.match(/http:\/\/(?!localhost\b|127\.0\.0\.1\b|0\.0\.0\.0\b|www\.w3\.org\b|json-schema\.org\b)[a-zA-Z0-9.-]+/);
    if (httpMatch && !normPath.endsWith(".md")) {
      const patchedLine = line.replace(
        /http:\/\/(?!localhost\b|127\.0\.0\.1\b|0\.0\.0\.0\b|www\.w3\.org\b|json-schema\.org\b)/g,
        "https://"
      );
      if (patchedLine !== line) {
        const proposedAfter = replaceSingleLine(lines, i, patchedLine);
        findings.push({
          id: makeFindingId("SAST-HTTP-005", normPath, lineNum),
          ruleId: "SAST-HTTP-005",
          cwe: "CWE-319",
          category: "SAST",
          severity: "MEDIUM",
          title: "Cleartext HTTP Endpoint Detected",
          description: `Unencrypted URL (${httpMatch[0]}) exposes traffic in transit to interception or tampering.`,
          howToFix: [
            "Upgrade the external URL from `http://` to `https://`.",
            "Click Approve & Auto-Fix to upgrade the scheme automatically.",
          ],
          filePath: normPath,
          lineStart: lineNum,
          lineEnd: lineNum,
          snippet: getLineSnippet(lines, i),
          autoFixable: true,
          fixRisk: "safe-autofix",
          fixStrategy: "file-patch",
          proposedAfter,
          diff: buildUnifiedDiff(normalizedContent, proposedAfter, normPath),
          fileSha256: fileHash,
          status: "PENDING_REVIEW",
          detectedAt: now,
        });
      }
    }

    // 8. Leftover debugger; statement (Auto-fixable!)
    if (/^\s*debugger\s*;?\s*$/.test(line)) {
      const copy = [...lines];
      copy.splice(i, 1);
      const proposedAfter = copy.join("\n");
      findings.push({
        id: makeFindingId("SAST-DBG-006", normPath, lineNum),
        ruleId: "SAST-DBG-006",
        cwe: "CWE-489",
        category: "SAST",
        severity: "LOW",
        title: "Leftover debugger; Statement",
        description: "A debugger breakpoint left in code pauses execution for users with browser DevTools open.",
        howToFix: [
          "Remove the `debugger;` line before committing or deploying.",
          "Click Approve & Auto-Fix to remove it cleanly.",
        ],
        filePath: normPath,
        lineStart: lineNum,
        lineEnd: lineNum,
        snippet: getLineSnippet(lines, i),
        autoFixable: true,
        fixRisk: "safe-autofix",
        fixStrategy: "file-patch",
        proposedAfter,
        diff: buildUnifiedDiff(normalizedContent, proposedAfter, normPath),
        fileSha256: fileHash,
        status: "PENDING_REVIEW",
        detectedAt: now,
      });
    }

    // 9. BudgetApp2025 Doctrine Rule 2: Zero Gradients in New Modular Components
    if (
      normPath.startsWith("src/components/") &&
      /(?:linear-gradient|radial-gradient)\s*\(/.test(line)
    ) {
      findings.push({
        id: makeFindingId("DOCTRINE-GRAD-002", normPath, lineNum),
        ruleId: "DOCTRINE-GRAD-002",
        cwe: "UX-DOCTRINE-2",
        category: "DOCTRINE",
        severity: "MEDIUM",
        title: "Gradient Detected in Senior-Friendly Component",
        description: "DOCTRINE.md Rule 2 forbids linear-gradient/radial-gradient on module/account/security cards.",
        howToFix: [
          "Replace the CSS gradient with a solid high-contrast token from `src/config/dtcgTokens.json` (e.g., `#0f1a2a` or `#101d31`).",
          "Re-verify WCAG AA/AAA text contrast (>= 4.5:1).",
        ],
        filePath: normPath,
        lineStart: lineNum,
        lineEnd: lineNum,
        snippet: getLineSnippet(lines, i),
        autoFixable: false,
        fixRisk: "requires-review",
        fixStrategy: "manual",
        proposedAfter: null,
        diff: "",
        fileSha256: fileHash,
        status: "PENDING_REVIEW",
        detectedAt: now,
      });
    }
  }

  // 10. Serverless API Auth Guard Check (api/*.js)
  const publicApiAllowlist = new Set([
    "api/health.js",
    "api/honeypot.js",
    "api/oauth-metadata.js",
    "api/.well-known/oauth-authorization-server.js",
    "api/oauth/authorize.js",
    "api/oauth/token.js",
  ]);
  if (
    normPath.startsWith("api/") &&
    !publicApiAllowlist.has(normPath) &&
    !/authorization|verifyAdmin|adminHandler|rolesHandler|permissionsHandler|getUser|getUserId|x-vercel-cron|verifyToken/i.test(normalizedContent)
  ) {
    findings.push({
      id: makeFindingId("SAST-API-007", normPath, 1),
      ruleId: "SAST-API-007",
      cwe: "CWE-306",
      category: "SAST",
      severity: "HIGH",
      title: "Serverless API Endpoint Missing Auth Check",
      description: `${normPath} does not appear to verify a Bearer JWT, user session, or admin authorization header.`,
      howToFix: [
        "Verify the caller's Supabase JWT (`auth.getUser(token)`) or call `verifyAdmin(req)` from `mcp/admin.js`.",
        "Return HTTP `401` when missing/invalid before querying or mutating Supabase data.",
      ],
      filePath: normPath,
      lineStart: 1,
      lineEnd: Math.min(10, lines.length),
      snippet: lines.slice(0, 6).join("\n"),
      autoFixable: false,
      fixRisk: "requires-review",
      fixStrategy: "manual",
      proposedAfter: null,
      diff: "",
      fileSha256: fileHash,
      status: "PENDING_REVIEW",
      detectedAt: now,
    });
  }

  return findings;
}

/**
 * Snyk Open Source equivalent: Scan package.json & npm audit advisories.
 */
export function scanDependencies(repoRoot = process.cwd(), options = {}) {
  const { runNpmAudit = true } = options;
  const findings = [];
  const now = new Date().toISOString();
  const pkgPath = resolveRepoPath(repoRoot, "package.json");

  if (!fs.existsSync(pkgPath)) return findings;
  const pkgRaw = fs.readFileSync(pkgPath, "utf8");
  const pkgHash = sha256(pkgRaw);

  try {
    const pkg = JSON.parse(pkgRaw);
    const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const [dep, ver] of Object.entries(allDeps)) {
      if (ver === "*" || ver === "latest") {
        findings.push({
          id: makeFindingId("SCA-PIN-001", "package.json", dep),
          ruleId: "SCA-PIN-001",
          cwe: "CWE-1104",
          category: "SCA",
          severity: "MEDIUM",
          title: `Unpinned Dependency Version: ${dep} (${ver})`,
          description: `Using '${ver}' allows unpredictable major updates that can break builds or introduce supply-chain risk.`,
          howToFix: [
            `Pin '${dep}' to a specific semver range (e.g., ^1.0.0) in package.json.`,
            "Run `npm install` to lock the exact version in package-lock.json.",
          ],
          filePath: "package.json",
          lineStart: 1,
          lineEnd: 1,
          snippet: `"${dep}": "${ver}"`,
          autoFixable: false,
          fixRisk: "requires-review",
          fixStrategy: "manual",
          proposedAfter: null,
          diff: "",
          fileSha256: pkgHash,
          status: "PENDING_REVIEW",
          detectedAt: now,
        });
      }
    }
  } catch (err) {
    findings.push({
      id: makeFindingId("SCA-JSON-001", "package.json", 1),
      ruleId: "SCA-JSON-001",
      cwe: "CWE-1126",
      category: "SCA",
      severity: "CRITICAL",
      title: "Invalid package.json Syntax",
      description: err.message,
      howToFix: ["Fix malformed JSON in package.json."],
      filePath: "package.json",
      lineStart: 1,
      lineEnd: 1,
      snippet: err.message,
      autoFixable: false,
      fixRisk: "requires-review",
      fixStrategy: "manual",
      proposedAfter: null,
      diff: "",
      fileSha256: pkgHash,
      status: "PENDING_REVIEW",
      detectedAt: now,
    });
  }

  if (!runNpmAudit) return findings;

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  let auditJson = null;
  try {
    const out = execFileSync(npmCmd, ["audit", "--json"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "pipe",
      timeout: 15000,
    });
    auditJson = JSON.parse(out);
  } catch (err) {
    // npm audit exits non-zero when vulnerabilities exist, but still outputs valid JSON in stdout
    if (err?.stdout) {
      try {
        auditJson = JSON.parse(String(err.stdout));
      } catch {
        auditJson = null;
      }
    }
  }

  if (auditJson && auditJson.vulnerabilities && typeof auditJson.vulnerabilities === "object") {
    for (const [pkgName, vuln] of Object.entries(auditJson.vulnerabilities)) {
      const sevRaw = String(vuln.severity || "medium").toUpperCase();
      const severity = ["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(sevRaw) ? sevRaw : "MEDIUM";
      const viaLabels = Array.isArray(vuln.via)
        ? vuln.via.map((v) => (typeof v === "string" ? v : v.title || v.name)).filter(Boolean)
        : [];
      const fixAvail = Boolean(vuln.fixAvailable);
      const fixInfo = typeof vuln.fixAvailable === "object" ? vuln.fixAvailable : null;

      findings.push({
        id: makeFindingId("SCA-CVE-002", `package-lock.json:${pkgName}`, severity),
        ruleId: "SCA-CVE-002",
        cwe: "CWE-1395",
        category: "SCA",
        severity,
        title: `Vulnerable Dependency: ${pkgName} (${severity})`,
        description: `${pkgName} (${vuln.range || "installed"}) has known advisories: ${viaLabels.slice(0, 3).join("; ") || "Security advisory reported by npm audit"}.`,
        howToFix: [
          fixInfo?.name && fixInfo?.version
            ? `Upgrade ${fixInfo.name} to ${fixInfo.version}: npm install ${fixInfo.name}@${fixInfo.version}`
            : "Run `npm audit fix` to update vulnerable transitive dependencies.",
          "Re-run `npm run pre-deploy-check` to confirm compatibility.",
        ],
        filePath: "package-lock.json",
        lineStart: 1,
        lineEnd: 1,
        snippet: `Package: ${pkgName}\nAffected range: ${vuln.range || "unknown"}\nVia: ${viaLabels.join(", ") || "advisory"}`,
        autoFixable: fixAvail && !fixInfo?.isSemVerMajor,
        fixRisk: fixInfo?.isSemVerMajor ? "requires-review" : "safe-autofix",
        fixStrategy: "npm-audit-fix",
        fixPackage: fixInfo?.name || pkgName,
        fixVersion: fixInfo?.version || null,
        proposedAfter: null,
        diff: fixInfo?.name
          ? `--- a/package.json\n+++ b/package.json\n- "${pkgName}": "${vuln.range || "*"}"\n+ "${fixInfo.name}": "^${fixInfo.version}"`
          : `Run: npm audit fix (non-breaking)`,
        fileSha256: pkgHash,
        status: "PENDING_REVIEW",
        detectedAt: now,
      });
    }
  }

  return findings;
}

/**
 * Check .gitignore, vercel.json security headers, and Honeynet invariants.
 */
export function scanRepoHygiene(repoRoot = process.cwd()) {
  const findings = [];
  const now = new Date().toISOString();

  const gitignorePath = resolveRepoPath(repoRoot, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, "utf8");
    if (!/^\.env$/m.test(content)) {
      findings.push({
        id: makeFindingId("SECRETS-ENV-001", ".gitignore", 1),
        ruleId: "SECRETS-ENV-001",
        cwe: "CWE-200",
        category: "SECRETS",
        severity: "CRITICAL",
        title: ".env Not Excluded in .gitignore",
        description: "Missing `.env` entry in `.gitignore` risks committing Supabase & SMTP credentials.",
        howToFix: ["Add `.env` and `.env.*` to `.gitignore` immediately."],
        filePath: ".gitignore",
        lineStart: 1,
        lineEnd: 1,
        snippet: "(missing .env rule)",
        autoFixable: false,
        fixRisk: "requires-review",
        fixStrategy: "manual",
        proposedAfter: null,
        diff: "",
        fileSha256: sha256(content),
        status: "PENDING_REVIEW",
        detectedAt: now,
      });
    }
  }

  const vercelPath = resolveRepoPath(repoRoot, "vercel.json");
  if (fs.existsSync(vercelPath)) {
    const raw = fs.readFileSync(vercelPath, "utf8");
    const requiredHoneypots = ["/.env", "/api/debug-env", "/api/v1/export-db", "/admin-backup.sql"];
    const missing = requiredHoneypots.filter((route) => !raw.includes(route));
    if (missing.length > 0) {
      findings.push({
        id: makeFindingId("DOCTRINE-HONEY-003", "vercel.json", 1),
        ruleId: "DOCTRINE-HONEY-003",
        cwe: "DOCTRINE-4",
        category: "DOCTRINE",
        severity: "HIGH",
        title: "Honeynet Deception Route Missing in vercel.json",
        description: `DOCTRINE.md Rule 4 requires preserving all Honeynet traps. Missing: ${missing.join(", ")}`,
        howToFix: ["Restore the missing Honeypot rewrite routes to `/api/honeypot.js` in `vercel.json`."],
        filePath: "vercel.json",
        lineStart: 1,
        lineEnd: 1,
        snippet: `Missing routes: ${missing.join(", ")}`,
        autoFixable: false,
        fixRisk: "requires-review",
        fixStrategy: "manual",
        proposedAfter: null,
        diff: "",
        fileSha256: sha256(raw),
        status: "PENDING_REVIEW",
        detectedAt: now,
      });
    }
  }

  return findings;
}

function walkFiles(dirAbs, repoRoot, out = []) {
  if (!fs.existsSync(dirAbs)) return out;
  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const full = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, repoRoot, out);
    } else if (entry.isFile()) {
      out.push(path.relative(repoRoot, full).replace(/\\/g, "/"));
    }
  }
  return out;
}

export function listWatchedFiles(repoRoot = process.cwd()) {
  const files = new Set();
  for (const root of SCAN_ROOTS) {
    for (const f of walkFiles(path.join(repoRoot, root), repoRoot)) {
      files.add(f);
    }
  }
  for (const extra of EXTRA_SCANNED_FILES) {
    if (fs.existsSync(path.join(repoRoot, extra))) files.add(extra);
  }
  return Array.from(files).sort();
}

export function computeSecurityScore(findings) {
  const active = (findings || []).filter(
    (f) => f.status !== "FIXED_VERIFIED" && f.status !== "IGNORED"
  );
  const penalty = active.reduce((sum, f) => sum + (SEVERITY_WEIGHT[f.severity] || 5), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function runFullScan(repoRoot = process.cwd(), options = {}) {
  const startedAt = Date.now();
  const files = listWatchedFiles(repoRoot);
  const findings = [];

  for (const rel of files) {
    findings.push(...scanFile(rel, repoRoot));
  }
  findings.push(...scanRepoHygiene(repoRoot));
  findings.push(...scanDependencies(repoRoot, options));

  const sevRank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  findings.sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9));

  return {
    scannedFilesCount: files.length,
    findings,
    score: computeSecurityScore(findings),
    durationMs: Date.now() - startedAt,
    completedAt: new Date().toISOString(),
  };
}
