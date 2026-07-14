# Clean build instructions

Run **Actions → Build Evasion Browser → Run workflow**.

Leave **Deploy the download website** unchecked until GitHub Pages is enabled:

`Repository → Settings → Pages → Source → GitHub Actions`

Manual runs create Windows and Linux artifacts.

For an official release:

```bat
git tag v1.0.0
git push origin v1.0.0
```
