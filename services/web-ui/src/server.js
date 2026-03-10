const path = require("path");
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const port = Number(process.env.WEB_PORT || 3000);
const apiUrl = process.env.API_URL || "http://api:8080";

app.use("/api", createProxyMiddleware({
  target: apiUrl,
  changeOrigin: true,
  pathRewrite: { "^/api": "" }
}));

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  process.stdout.write(`docforge-web-ui listening on ${port}\n`);
});
