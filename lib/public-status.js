'use strict';

/** Return only the freshness fields needed by the public source-status panel. */
function publicStatus(snapshot) {
  const rawTasks = snapshot && Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
  const tasks = rawTasks.map((task, index) => {
    const everyMs = task && task.everyMs != null ? Number(task.everyMs) : Number.NaN;
    const ageMs = task && task.ageMs != null ? Number(task.ageMs) : Number.NaN;
    const hasData = Boolean(task && task.hasData);
    const consecutiveFails = Number(task && task.consecutiveFails) || 0;
    const late = hasData && Number.isFinite(ageMs) && Number.isFinite(everyMs)
      && everyMs > 0 && ageMs > everyMs * 2.5;
    const id = /^[a-z0-9_-]{1,40}$/i.test(String(task && task.id || ''))
      ? String(task.id) : 'source-' + (index + 1);

    return {
      id,
      label: String(task && task.label || 'Sumber').slice(0, 80),
      everyMs: Number.isFinite(everyMs) && everyMs > 0 ? everyMs : null,
      everyLabel: String(task && task.everyLabel || '').slice(0, 32),
      hasData,
      ageMs: Number.isFinite(ageMs) && ageMs >= 0 ? ageMs : null,
      ageLabel: String(task && task.ageLabel || 'belum pernah').slice(0, 40),
      healthy: Boolean(task && task.healthy),
      critical: Boolean(task && task.critical),
      requested: Number(task && task.runs || 0) + Number(task && task.fails || 0) > 0,
      late,
      persistentFailure: consecutiveFails >= 3,
      needsAttention: late || consecutiveFails >= 3
    };
  });
  const timestamp = Date.parse(snapshot && snapshot.updatedAt);

  return {
    updatedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString(),
    mode: snapshot && snapshot.mode === 'timer internal' ? 'timer internal' : 'dipicu penjadwal luar',
    tasks,
    healthy: tasks.filter(task => task.healthy).length,
    total: tasks.length
  };
}

module.exports = publicStatus;
