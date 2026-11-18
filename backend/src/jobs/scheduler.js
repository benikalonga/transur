const cron = require('node-cron');
const { sql } = require('../db/pool');
const bookings = require('../services/bookings');

/**
 * Background housekeeping. Running these from cron (instead of in-memory
 * timers) means nothing is lost if the API restarts.
 */
const tasks = [
  {
    name: 'release scheduled bookings',
    every: '* * * * *',
    run: () => bookings.releaseScheduled(),
  },
  {
    name: 'expire unanswered requests',
    every: '*/30 * * * * *',
    run: () => bookings.expireStale(),
  },
  {
    // Providers whose phone stopped reporting for 15 min are taken offline so
    // riders are not shown supply that is not really there.
    name: 'take silent providers offline',
    every: '*/5 * * * *',
    run: async () => {
      const result = await sql(
        `UPDATE fleet_profiles fp
         LEFT JOIN fleet_positions pos ON pos.user_id = fp.user_id
         SET fp.availability = 'offline'
         WHERE fp.availability = 'online'
           AND (pos.updated_at IS NULL OR pos.updated_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE))`
      );
      return result.affectedRows;
    },
  },
];

const startScheduler = () => {
  tasks.forEach((task) => {
    let running = false;
    cron.schedule(task.every, async () => {
      if (running) return; // never overlap the same task
      running = true;
      try {
        const n = await task.run();
        if (n) console.log(`[jobs] ${task.name}: ${n}`);
      } catch (err) {
        console.warn(`[jobs] ${task.name} failed:`, err.message);
      } finally {
        running = false;
      }
    });
  });
};

module.exports = { startScheduler };
