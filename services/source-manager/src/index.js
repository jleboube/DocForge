const apiUrl = process.env.API_URL || "http://api:8080";
const intervalSeconds = Number(process.env.INTERVAL_SECONDS || 300);

async function tick() {
  try {
    const response = await fetch(`${apiUrl}/admin/scan-sources`, { method: "POST" });
    const body = await response.json();
    process.stdout.write(`[source-manager] queued=${body.queued || 0}\n`);
  } catch (error) {
    process.stderr.write(`[source-manager] error=${error.message}\n`);
  }
}

setInterval(tick, intervalSeconds * 1000);
tick();
