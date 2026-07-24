/**
 * Cron-based scheduler for automatic email reports.
 * Checks every minute if any schedules need to fire,
 * fetches user data from Supabase, generates the report, and sends the email.
 */
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { generateReportHTML } from "./report-generator.js";
import { sendReportEmail } from "./email.js";

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    realtime: {
      transport: ws
    }
  });
}

/**
 * Check if a schedule should fire right now.
 */
function shouldFire(schedule) {
  const now = new Date();
  // Use timezone-aware comparison
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: schedule.timezone || 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const parts = formatter.formatToParts(now);
  const currentHour = parts.find(p => p.type === 'hour')?.value;
  const currentMinute = parts.find(p => p.type === 'minute')?.value;
  const currentWeekday = parts.find(p => p.type === 'weekday')?.value;
  const currentTime = `${currentHour}:${currentMinute}`;

  // Get current day of month in the schedule's timezone
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: schedule.timezone || 'Asia/Manila',
    day: 'numeric',
  });
  const currentDayOfMonth = parseInt(dayFormatter.format(now));

  // Map weekday name to number (0=Sun)
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const currentDayOfWeek = dayMap[currentWeekday] ?? now.getDay();

  // Prevent sending twice in the same minute
  if (schedule.last_sent_at) {
    const lastSent = new Date(schedule.last_sent_at);
    const diffMs = now.getTime() - lastSent.getTime();
    if (diffMs < 120_000) return false; // Skip if sent less than 2 minutes ago
  }

  // Handle minutes frequency (e.g. every 5, 10, 15, 20, 30, 45, 60 minutes)
  if (schedule.frequency === 'minutes') {
    const interval = Number(schedule.day_of_month) || 15;
    const currentMin = now.getMinutes();
    return currentMin % interval === 0;
  }

  if (currentTime !== schedule.time) return false;

  if (schedule.frequency === 'daily') return true;
  if (schedule.frequency === 'weekly') return currentDayOfWeek === (schedule.day_of_week ?? 1);
  if (schedule.frequency === 'monthly') return currentDayOfMonth === (schedule.day_of_month ?? 1);

  return false;
}

/**
 * Process a single schedule: fetch data, generate report, send email.
 */
export async function processSchedule(supabase, schedule) {
  try {
    // Get the user's email from auth
    const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(schedule.user_id);
    if (authErr || !authData?.user?.email) {
      console.error(`[Scheduler] Cannot find email for user ${schedule.user_id}:`, authErr?.message);
      return;
    }
    const email = authData.user.email;

    // Fetch user's budget data
    const { data: rows, error: dataErr } = await supabase
      .from('user_data')
      .select('*')
      .eq('user_id', schedule.user_id)
      .limit(1);

    if (dataErr || !rows?.length) {
      console.error(`[Scheduler] No data for user ${schedule.user_id}:`, dataErr?.message);
      return;
    }

    const userData = rows[0];
    const range = schedule.report_range || 'current';
    const html = generateReportHTML(userData, range);
    const subject = `Budget App — Scheduled Report (${schedule.frequency})`;

    await sendReportEmail(email, subject, html);

    // Update last_sent_at
    await supabase
      .from('report_schedules')
      .update({ last_sent_at: new Date().toISOString() })
      .eq('id', schedule.id);

    console.log(`[Scheduler] ✅ Report sent to ${email} (schedule: ${schedule.id}, freq: ${schedule.frequency})`);
  } catch (err) {
    console.error(`[Scheduler] ❌ Error processing schedule ${schedule.id}:`, err.message);
  }
}

/**
 * The main tick — runs every minute.
 */
export async function tick() {
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    const { data: schedules, error } = await supabase
      .from('report_schedules')
      .select('*')
      .eq('enabled', true);

    if (error) {
      console.error('[Scheduler] Error fetching schedules:', error.message);
      return;
    }

    if (!schedules || schedules.length === 0) return;

    for (const schedule of schedules) {
      if (shouldFire(schedule)) {
        await processSchedule(supabase, schedule);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Tick error:', err.message);
  }
}

/**
 * Start the scheduler. Call once on server boot.
 */
export function startScheduler() {
  // Check if SMTP is configured
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn('[Scheduler] SMTP not configured — scheduled reports will not send emails.');
  }

  // Run every minute
  cron.schedule('* * * * *', tick);
  console.log('[Scheduler] ✅ Report scheduler started (checking every minute)');
}
