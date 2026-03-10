const apiUrl = process.env.API_URL || "http://api:8080";
const intervalSeconds = Number(process.env.INTERVAL_SECONDS || 180);

async function tick() {
  try {
    const retryResponse = await fetch(`${apiUrl}/admin/retry-failed`, { method: "POST" });
    const retryBody = await retryResponse.json();

    const statsResponse = await fetch(`${apiUrl}/admin/stats`);
    const stats = await statsResponse.json();

    process.stdout.write(`[scheduler] requeued=${retryBody.requeued || 0} pending=${stats.pendingJobs || 0} failed=${stats.failedJobs || 0}\n`);
  } catch (error) {
    process.stderr.write(`[scheduler] error=${error.message}\n`);
  }
}

setInterval(tick, intervalSeconds * 1000);
tick();
