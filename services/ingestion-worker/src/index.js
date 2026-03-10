const apiUrl = process.env.API_URL || "http://api:8080";
const intervalSeconds = Number(process.env.INTERVAL_SECONDS || 15);

async function tick() {
  try {
    const response = await fetch(`${apiUrl}/admin/process-jobs?limit=5`, { method: "POST" });
    const body = await response.json();
    process.stdout.write(`[ingestion-worker] picked=${body.picked || 0} processed=${body.processed || 0} failed=${body.failed || 0}\n`);
  } catch (error) {
    process.stderr.write(`[ingestion-worker] error=${error.message}\n`);
  }
}

setInterval(tick, intervalSeconds * 1000);
tick();
