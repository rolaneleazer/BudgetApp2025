import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { processSchedule } from "../mcp/scheduler.js";

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
 * Extract user_id from the Supabase JWT in the Authorization header.
 */
async function getUserId(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const client = createClient(url, anonKey, {
    realtime: {
      transport: ws
    }
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

export default async function handler(req, res) {
  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured on server.' });
  }

  const userId = await getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  // GET — list schedules
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('report_schedules')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ schedules: data || [] });
  }

  // POST — create schedule or trigger now
  if (req.method === 'POST') {
    const action = req.query?.action || new URL(req.url, 'http://localhost').searchParams.get('action');
    
    // Action: Trigger immediately
    if (action === 'trigger') {
      const id = req.query?.id || new URL(req.url, 'http://localhost').searchParams.get('id');
      if (!id) return res.status(400).json({ error: 'Missing schedule id' });

      const { data: schedule, error: fetchErr } = await supabase
        .from('report_schedules')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (fetchErr || !schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      // Process immediately
      await processSchedule(supabase, schedule);
      return res.status(200).json({ success: true, message: 'Report sent immediately!' });
    }

    const { frequency, time, day_of_week, day_of_month, report_range, timezone } = req.body || {};

    if (!frequency) {
      return res.status(400).json({ error: 'Missing required field: frequency' });
    }

    if (!['daily', 'weekly', 'monthly', 'minutes'].includes(frequency)) {
      return res.status(400).json({ error: 'frequency must be daily, weekly, monthly, or minutes' });
    }

    // Time is only required for non-minute schedules
    if (frequency !== 'minutes' && !time) {
      return res.status(400).json({ error: 'Missing required field: time' });
    }

    // Validate time format HH:MM if provided
    if (time && !/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({ error: 'time must be in HH:MM format (24h)' });
    }

    const row = {
      user_id: userId,
      frequency,
      time: frequency === 'minutes' ? '00:00' : time,
      day_of_week: frequency === 'weekly' ? (day_of_week ?? 1) : null,
      day_of_month: frequency === 'monthly' ? (day_of_month ?? 1) : (frequency === 'minutes' ? (day_of_month ?? 15) : null),
      report_range: report_range || 'current',
      timezone: timezone || 'Asia/Manila',
      enabled: true,
    };

    const { data, error } = await supabase
      .from('report_schedules')
      .insert(row)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ schedule: data });
  }

  // PATCH — toggle enabled
  if (req.method === 'PATCH') {
    const id = req.query?.id || new URL(req.url, 'http://localhost').searchParams.get('id');
    if (!id) return res.status(400).json({ error: 'Missing schedule id' });

    const { enabled } = req.body || {};

    const { data, error } = await supabase
      .from('report_schedules')
      .update({ enabled: Boolean(enabled) })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ schedule: data });
  }

  // DELETE — remove schedule
  if (req.method === 'DELETE') {
    const id = req.query?.id || new URL(req.url, 'http://localhost').searchParams.get('id');
    if (!id) return res.status(400).json({ error: 'Missing schedule id' });

    const { error } = await supabase
      .from('report_schedules')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
