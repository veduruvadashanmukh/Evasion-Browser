const cards = document.getElementById("downloadCards");
const primary = document.getElementById("primaryDownload");
const primaryLabel = document.getElementById("primaryLabel");
const hint = document.getElementById("downloadHint");
const versionText = document.getElementById("versionText");

const platform = /Windows/i.test(navigator.userAgent) ? "windows" : /Linux/i.test(navigator.userAgent) ? "linux" : /Mac/i.test(navigator.userAgent) ? "mac" : "other";

const escapeHTML = (value) => String(value ?? "").replace(/[&<>\"']/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[character]));

function render(manifest) {
  versionText.textContent = `Version ${manifest.version} · ${manifest.channel}`;
  const available = manifest.downloads.filter((item) => item.available);
  cards.innerHTML = manifest.downloads.map((item) => `
    <article class="download-card ${item.available ? "" : "unavailable"}">
      <header><h3>${escapeHTML(item.title)}</h3><span class="platform-badge">${escapeHTML(item.platform)}</span></header>
      <p>${escapeHTML(item.description)}</p>
      ${item.available ? `<a class="button primary" href="${encodeURI(item.file)}" download>Download ${escapeHTML(item.label)}</a>` : `<span class="button secondary">Coming soon</span>`}
      <div class="checksum"><strong>SHA-256</strong><br>${escapeHTML(item.sha256 || "Generated after the build is prepared")}</div>
    </article>`).join("");

  const preferred = available.find((item) => item.platformKey === platform) || available[0];
  if (preferred) {
    primary.href = preferred.file;
    primary.setAttribute("download", "");
    primary.classList.remove("disabled");
    primary.removeAttribute("aria-disabled");
    primaryLabel.textContent = `Download ${preferred.label}`;
    hint.textContent = `${preferred.title} · Version ${manifest.version}`;
  } else {
    primaryLabel.textContent = "Build files not added yet";
    hint.textContent = "Run the release preparation script to place installers in this page.";
  }
}

fetch("release-manifest.json", { cache: "no-store" })
  .then((response) => { if (!response.ok) throw new Error("Manifest unavailable"); return response.json(); })
  .then(render)
  .catch(() => {
    versionText.textContent = "Release information unavailable";
    cards.innerHTML = '<article class="download-card unavailable"><h3>No release files yet</h3><p>Run build-and-prepare-release.bat from the project folder.</p></article>';
    primaryLabel.textContent = "No build available";
  });
