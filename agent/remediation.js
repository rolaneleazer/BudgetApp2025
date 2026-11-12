import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import esbuild from "esbuild";

const BACKUP_DIR_NAME = ".sentinel-backups";

export function sha256(text) {
  return crypto.createHash("sha256").update(text ?? "", "utf8").digest("hex");
}

/**
 * Resolve a relative repo path safely, rejecting path traversal outside repoRoot.
 */
export function resolveRepoPath(repoRoot, relPath) {
  const root = path.resolve(repoRoot);
  const resolved = path.resolve(root, relPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Unsafe path outside repository root: ${relPath}`);
  }
  return resolved;
}

/**
 * Generate a compact unified diff showing changed lines with 2 lines of context.
 */
export function buildUnifiedDiff(beforeText, afterText, filePath = "file", contextLines = 2) {
  const a = String(beforeText ?? "").replace(/\r\n/g, "\n").split("\n");
  const b = String(afterText ?? "").replace(/\r\n/g, "\n").split("\n");

  if (a.join("\n") === b.join("\n")) {
    return "";
  }

  // Find first and last differing line indices to bound work cleanly on large files
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  const aStart = Math.max(0, prefix - contextLines);
  const aEnd = Math.min(a.length, a.length - suffix + contextLines);
  const bStart = Math.max(0, prefix - contextLines);
  const bEnd = Math.min(b.length, b.length - suffix + contextLines);

  const lines = [
    `--- a/${filePath.replace(/\\/g, "/")}`,
    `+++ b/${filePath.replace(/\\/g, "/")}`,
    `@@ -${aStart + 1},${Math.max(0, aEnd - aStart)} +${bStart + 1},${Math.max(0, bEnd - bStart)} @@`,
  ];

  // Leading context
  for (let i = aStart; i < prefix; i++) {
    lines.push(` ${a[i]}`);
  }

  // Changed middle section
  const aMidEnd = a.length - suffix;
  const bMidEnd = b.length - suffix;
  for (let i = prefix; i < aMidEnd; i++) {
    lines.push(`-${a[i]}`);
  }
  for (let i = prefix; i < bMidEnd; i++) {
    lines.push(`+${b[i]}`);
  }

  // Trailing context
  for (let i = aMidEnd; i < aEnd; i++) {
    lines.push(` ${a[i]}`);
  }

  return lines.join("\n");
}

/**
 * Save a pre-patch backup snapshot of one or more relative files.
 */
export function createBackupSnapshot(repoRoot, relPaths, findingId = "manual") {
  const backupId = `bak_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const backupFolder = path.join(repoRoot, BACKUP_DIR_NAME, backupId);
  fs.mkdirSync(backupFolder, { recursive: true });

  const files = [];
  for (const rel of relPaths) {
    const abs = resolveRepoPath(repoRoot, rel);
    const existed = fs.existsSync(abs);
    const content = existed ? fs.readFileSync(abs, "utf8") : "";
    const safeName = rel.replace(/[^a-zA-Z0-9._-]/g, "_") + ".bak";
    fs.writeFileSync(path.join(backupFolder, safeName), content, "utf8");
    files.push({
      relPath: rel.replace(/\\/g, "/"),
      existed,
      sha256: sha256(content),
      backupFile: safeName,
    });
  }

  const meta = {
    backupId,
    findingId,
    createdAt: new Date().toISOString(),
    files,
  };
  fs.writeFileSync(path.join(backupFolder, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  return meta;
}

/**
 * Restore files from an existing backup snapshot.
 */
export function restoreBackupSnapshot(repoRoot, backupId) {
  const safeId = String(backupId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) throw new Error("Invalid backupId.");
  const backupFolder = path.join(repoRoot, BACKUP_DIR_NAME, safeId);
  const metaPath = path.join(backupFolder, "meta.json");
  if (!fs.existsSync(metaPath)) {
    throw new Error(`Backup snapshot '${safeId}' not found.`);
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const restoredFiles = [];
  for (const entry of meta.files || []) {
    const targetAbs = resolveRepoPath(repoRoot, entry.relPath);
    if (!entry.existed) {
      if (fs.existsSync(targetAbs)) fs.unlinkSync(targetAbs);
    } else {
      const bakContent = fs.readFileSync(path.join(backupFolder, entry.backupFile), "utf8");
      fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
      fs.writeFileSync(targetAbs, bakContent, "utf8");
    }
    restoredFiles.push(entry.relPath);
  }

  return { backupId: safeId, restoredFiles, restoredAt: new Date().toISOString() };
}

/**
 * Verify JS/JSX syntax using esbuild in-process (fast, no subprocess).
 */
export function verifySyntaxWithEsbuild(filePath, content) {
  const ext = path.extname(filePath).toLowerCase();
  if (![".js", ".mjs", ".cjs", ".jsx"].includes(ext)) return { ok: true };
  const loader = ext === ".jsx" ? "jsx" : "js";
  try {
    esbuild.transformSync(content, { loader, format: "esm" });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Apply an approved finding fix, run Adversarial Verification, and auto-rollback on failure.
 */
export function applyFindingFix(finding, repoRoot, options = {}) {
  const { runPreDeployGate = true, rescanFileFn = null } = options;

  if (!finding) {
    return { ok: false, error: "Finding not found." };
  }
  if (!finding.autoFixable) {
    return {
      ok: false,
      error: "This finding requires manual review/editing and does not have a deterministic auto-fix.",
    };
  }

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

  if (finding.fixStrategy === "npm-audit-fix") {
    const backup = createBackupSnapshot(repoRoot, ["package.json", "package-lock.json"], finding.id);
    try {
      const args = finding.fixPackage && finding.fixVersion
        ? ["install", `${finding.fixPackage}@${finding.fixVersion}`, "--no-audit", "--no-fund"]
        : ["audit", "fix"];
      execFileSync(npmCmd, args, { cwd: repoRoot, encoding: "utf8", stdio: "pipe" });

      if (runPreDeployGate) {
        execFileSync(process.execPath, ["--max-http-header-size=65536", "scripts/pre-deploy-check.js"], {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: "pipe",
        });
      }

      return {
        ok: true,
        verified: true,
        backupId: backup.backupId,
        message: `Dependency fix applied (${args.join(" ")}) and Quality Gate passed.`,
      };
    } catch (err) {
      restoreBackupSnapshot(repoRoot, backup.backupId);
      return {
        ok: false,
        rolledBack: true,
        backupId: backup.backupId,
        error: `Dependency fix verification failed; rolled back safely. Details: ${err.message}`,
      };
    }
  }

  // Standard file-patch strategy
  if (!finding.filePath || typeof finding.proposedAfter !== "string") {
    return { ok: false, error: "Finding does not contain a valid proposed file patch." };
  }

  const absTarget = resolveRepoPath(repoRoot, finding.filePath);
  if (!fs.existsSync(absTarget)) {
    return { ok: false, error: `Target file no longer exists: ${finding.filePath}` };
  }

  const currentContent = fs.readFileSync(absTarget, "utf8");
  if (finding.fileSha256 && sha256(currentContent) !== finding.fileSha256) {
    return {
      ok: false,
      error: "File changed on disk since this finding was scanned. Re-scan the file to refresh the patch.",
    };
  }

  // Verify syntax of proposed content before writing
  const syntaxResult = verifySyntaxWithEsbuild(finding.filePath, finding.proposedAfter);
  if (!syntaxResult.ok) {
    return {
      ok: false,
      error: `Proposed patch failed syntax validation and was not written: ${syntaxResult.error}`,
    };
  }

  const backup = createBackupSnapshot(repoRoot, [finding.filePath], finding.id);
  try {
    fs.writeFileSync(absTarget, finding.proposedAfter, "utf8");

    // Re-scan modified file to confirm finding is resolved
    if (typeof rescanFileFn === "function") {
      const remaining = rescanFileFn(finding.filePath, repoRoot);
      const stillPresent = remaining.some((f) => f.id === finding.id);
      if (stillPresent) {
        throw new Error(`Post-patch re-scan shows rule ${finding.ruleId} is still triggered.`);
      }
    }

    if (runPreDeployGate) {
      execFileSync(process.execPath, ["--max-http-header-size=65536", "scripts/pre-deploy-check.js"], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: "pipe",
      });
    }

    return {
      ok: true,
      verified: true,
      backupId: backup.backupId,
      message: `Patch applied to ${finding.filePath} and verified via Quality Gate.`,
    };
  } catch (err) {
    restoreBackupSnapshot(repoRoot, backup.backupId);
    return {
      ok: false,
      rolledBack: true,
      backupId: backup.backupId,
      error: `Verification failed; automatically rolled back ${finding.filePath}. Reason: ${err.message}`,
    };
  }
}

