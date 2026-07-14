const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const root = path.resolve(__dirname, "..", "download-site");
const port = Number(process.env.PORT || 4173);
const mime = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".png":"image/png", ".svg":"image/svg+xml", ".ico":"image/x-icon", ".exe":"application/vnd.microsoft.portable-executable", ".AppImage":"application/octet-stream", ".deb":"application/vnd.debian.binary-package" };

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) && file !== path.join(root, "index.html")) { res.writeHead(403); return res.end("Forbidden"); }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`Evasion download page: ${url}`);
  if (process.platform === "win32") exec(`start "" "${url}"`);
});
