import os from "node:os";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { getMcpConfig, healthPayload } from "../mcp/core.js";

let invocationCount = 0;
let lastCpuUsage = process.cpuUsage();
let lastSampleTimeNs = process.hrtime.bigint();

function round2(num) {
  return Math.round((Number(num) || 0) * 100) / 100;
}

function bytesToMb(bytes) {
  return round2((Number(bytes) || 0) / (1024 * 1024));
}

async function measureSupabasePing() {
  const { supabaseUrl, supabaseKey, supabaseKeySource, hasSupabase } = getMcpConfig();
  if (!hasSupabase) {
    return {
      configured: false,
      reachable: false,
      latencyMs: null,
      keySource: supabaseKeySource,
      rowCount: null
    };
  }

  const startNs = process.hrtime.bigint();
  try {
    const client = createClient(supabaseUrl, supabaseKey, {
      realtime: { transport: ws }
    });
    const { count, error } = await client
      .from("user_data")
      .select("user_id", { count: "exact", head: true });
    const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
    if (error) {
      return {
        configured: true,
        reachable: false,
        latencyMs: round2(elapsedMs),
        keySource: supabaseKeySource,
        error: error.message
      };
    }
    return {
      configured: true,
      reachable: true,
      latencyMs: round2(elapsedMs),
      keySource: supabaseKeySource,
      userRowsCount: typeof count === "number" ? count : null
    };
  } catch (err) {
    const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1e6;
    return {
      configured: true,
      reachable: false,
      latencyMs: round2(elapsedMs),
      keySource: supabaseKeySource,
      error: err.message
    };
  }
}

export default async function handler(req, res) {
  const isTelemetry =
    req?.query?.telemetry === "1" ||
    req?.query?.telemetry === "true" ||
    req?.query?.mode === "resources";

  if (!isTelemetry) {
    return res.status(200).json(healthPayload());
  }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req?.method === "OPTIONS") {
    return res.status(200).end();
  }

  const handlerStartNs = process.hrtime.bigint();
  invocationCount += 1;

  // CPU sampling
  const nowNs = process.hrtime.bigint();
  const elapsedMicros = Math.max(1000, Number(nowNs - lastSampleTimeNs) / 1000);
  const cpuDiff = process.cpuUsage(lastCpuUsage);
  lastCpuUsage = process.cpuUsage();
  lastSampleTimeNs = nowNs;

  const cpus = os.cpus() || [];
  const coreCount = Math.max(1, cpus.length);
  const totalCpuMicros = cpuDiff.user + cpuDiff.system;
  const processCpuTotalPct = round2(Math.min(100, (totalCpuMicros / (elapsedMicros * coreCount)) * 100));
  const processCpuSingleCorePct = round2(Math.min(100, (totalCpuMicros / elapsedMicros) * 100));

  // RAM / Memory sampling
  const mem = process.memoryUsage();
  const totalSystemMemBytes = os.totalmem();
  const freeSystemMemBytes = os.freemem();
  const usedSystemMemBytes = Math.max(0, totalSystemMemBytes - freeSystemMemBytes);
  const lambdaLimitMb = Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE) || null;
  const rssMb = bytesToMb(mem.rss);
  const effectiveRamLimitMb = lambdaLimitMb || bytesToMb(totalSystemMemBytes);

  // Supabase Ping
  const supabasePing = await measureSupabasePing();

  const handlerDurationMs = round2(Number(process.hrtime.bigint() - handlerStartNs) / 1e6);

  return res.status(200).json({
    ok: true,
    timestamp: new Date().toISOString(),
    vercel: {
      isVercel: Boolean(process.env.VERCEL),
      region: process.env.VERCEL_REGION || "local-node",
      env: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
      gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA
        ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
        : null,
      invocationCount,
      coldStart: invocationCount === 1,
      nodeVersion: process.version,
      uptimeSeconds: round2(process.uptime()),
      handlerDurationMs,
      maxDurationLimitSec: 10
    },
    cpu: {
      cores: coreCount,
      model: cpus[0]?.model || "Node Virtual CPU",
      processCpuPct: processCpuTotalPct,
      singleCorePct: processCpuSingleCorePct,
      userMs: round2(cpuDiff.user / 1000),
      systemMs: round2(cpuDiff.system / 1000),
      loadAvg1m: round2(os.loadavg()[0]),
      loadAvg5m: round2(os.loadavg()[1]),
      loadAvg15m: round2(os.loadavg()[2])
    },
    memory: {
      rssMb,
      heapUsedMb: bytesToMb(mem.heapUsed),
      heapTotalMb: bytesToMb(mem.heapTotal),
      externalMb: bytesToMb(mem.external),
      arrayBuffersMb: bytesToMb(mem.arrayBuffers || 0),
      lambdaLimitMb,
      containerTotalMb: bytesToMb(totalSystemMemBytes),
      containerFreeMb: bytesToMb(freeSystemMemBytes),
      containerUsedMb: bytesToMb(usedSystemMemBytes),
      containerUsedPct: totalSystemMemBytes > 0
        ? round2((usedSystemMemBytes / totalSystemMemBytes) * 100)
        : 0,
      processRamPctOfLimit: effectiveRamLimitMb > 0
        ? round2(Math.min(100, (rssMb / effectiveRamLimitMb) * 100))
        : 0
    },
    supabase: supabasePing
  });
}
