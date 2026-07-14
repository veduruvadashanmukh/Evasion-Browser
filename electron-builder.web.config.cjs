const packageJSON = require("./package.json");

const base = packageJSON.build || {};
const repository = String(process.env.GITHUB_REPOSITORY || "").trim();
const [owner, repo] = repository.includes("/")
  ? repository.split("/", 2)
  : ["", ""];

const directPackageURL = String(
  process.env.EVASION_PACKAGE_URL || ""
).trim();

const genericReleaseURL = String(
  process.env.EVASION_RELEASE_BASE_URL || ""
).trim().replace(/\/$/, "");

let publish;

if (owner && repo) {
  publish = [{
    provider: "github",
    owner,
    repo,
    releaseType: "release"
  }];
} else if (genericReleaseURL) {
  publish = [{
    provider: "generic",
    url: genericReleaseURL
  }];
} else if (!directPackageURL) {
  throw new Error(
    "Online installer URL is missing. Set GITHUB_REPOSITORY=owner/repo, " +
    "EVASION_RELEASE_BASE_URL=https://your-domain/releases, or " +
    "EVASION_PACKAGE_URL=https://your-domain/download/latest before building."
  );
}

const commonNsis = {
  ...(base.nsis || {}),
  oneClick: true,
  perMachine: false,
  allowElevation: true,
  allowToChangeInstallationDirectory: false,
  createDesktopShortcut: true,
  createStartMenuShortcut: true,
  shortcutName: "Evasion Browser",
  runAfterFinish: true
};

const nsisWeb = {
  ...commonNsis,
  artifactName: "Evasion-Web-Setup-${version}.${ext}"
};

if (directPackageURL) {
  nsisWeb.appPackageUrl = directPackageURL;
}

module.exports = {
  ...base,
  win: {
    ...(base.win || {}),
    target: [{
      target: "nsis-web",
      arch: ["x64"]
    }]
  },
  nsisWeb,
  publish
};
