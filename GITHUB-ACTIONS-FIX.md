# GitHub Actions build fix

This project no longer lets `electron-builder` publish automatically during ordinary CI builds.

## Manual build from GitHub Actions

1. Push this project to the repository.
2. Open **Actions → Build and publish Evasion Browser**.
3. Select **Run workflow**.
4. Download `Evasion-Windows` or `Evasion-Linux` from the run's Artifacts section.

A manual workflow creates artifacts but does not create a GitHub Release.

## Publish a versioned release

Run locally:

```bat
git add .
git commit -m "Fix Evasion release workflow"
git push

git tag v1.0.0
git push origin v1.0.0
```

A version tag:

- creates the offline installer and portable app;
- creates Linux packages;
- publishes them to GitHub Releases;
- builds and publishes the small online installer;
- deploys the download website to GitHub Pages.

No personal access token is needed. The workflow uses GitHub's built-in `GITHUB_TOKEN`.
