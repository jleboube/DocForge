const apiUrl = process.env.API_URL || "http://api:8080";
const intervalSeconds = Number(process.env.INTERVAL_SECONDS || 60);

async function tick() {
  try {
    const response = await fetch(`${apiUrl}/admin/reembed-missing?limit=500`, { method: "POST" });
    const body = await response.json();
    process.stdout.write(`[embedding-worker] updated=${body.updated || 0}\n`);
  } catch (error) {
    process.stderr.write(`[embedding-worker] error=${error.message}\n`);
  }
}

setInterval(tick, intervalSeconds * 1000);
tick();
