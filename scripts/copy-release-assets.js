const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const site = path.join(root, "download-site");
const downloadsDir = path.join(site, "downloads");
const manifestPath = path.join(site, "release-manifest.json");
const packageJSON = require(path.join(root, "package.json"));

if (!fs.existsSync(dist)) {
  console.error("dist folder not found. Build the application first.");
  process.exit(1);
}

fs.mkdirSync(downloadsDir, { recursive: true });
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const files = fs.readdirSync(dist).filter((name) => fs.statSync(path.join(dist, name)).isFile());
const lower = (value) => value.toLowerCase();

const onlineInstaller = files.find((name) => lower(name).endsWith(".exe") && lower(name).includes("web-setup"));
const portable = files.find((name) => lower(name).endsWith(".exe") && lower(name).includes("portable"));
const offlineInstaller = files.find((name) =>
  lower(name).endsWith(".exe") &&
  !lower(name).includes("portable") &&
  !lower(name).includes("web-setup") &&
  !lower(name).includes("uninstall")
);
const appImage = files.find((name) => lower(name).endsWith(".appimage"));
const deb = files.find((name) => lower(name).endsWith(".deb"));

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.version = packageJSON.version;
manifest.generatedAt = new Date().toISOString();

function byTitle(title) {
  return manifest.downloads.find((item) => item.title === title);
}

function attach(title, sourceName, targetName) {
  const item = byTitle(title);
  if (!item) return;
  if (!sourceName) {
    item.available = false;
    item.sha256 = "";
    return;
  }

  const source = path.join(dist, sourceName);
  const destination = path.join(downloadsDir, targetName);
  fs.copyFileSync(source, destination);
  item.file = `downloads/${targetName}`;
  item.sha256 = hash(destination);
  item.available = true;
}

attach("Online Installer", onlineInstaller, `Evasion-Web-Setup-${packageJSON.version}.exe`);
attach("Windows Installer", offlineInstaller, `Evasion-Browser-${packageJSON.version}-Windows-Setup.exe`);
attach("Windows Portable", portable, `Evasion-Browser-${packageJSON.version}-Windows-Portable.exe`);
attach("Linux AppImage", appImage, `Evasion-Browser-${packageJSON.version}-Linux.AppImage`);

let debItem = byTitle("Linux DEB Package");
if (deb && !debItem) {
  debItem = {
    title: "Linux DEB Package",
    label: "DEB",
    platform: "Debian / Ubuntu · x64",
    platformKey: "linux",
    description: "Installable package for Debian and Ubuntu based distributions.",
    file: "",
    sha256: "",
    available: false
  };
  const macIndex = manifest.downloads.findIndex((item) => item.platformKey === "mac");
  manifest.downloads.splice(macIndex < 0 ? manifest.downloads.length : macIndex, 0, debItem);
}
attach("Linux DEB Package", deb, `Evasion-Browser-${packageJSON.version}-Linux.deb`);

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("Download page prepared:", site);
