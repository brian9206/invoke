# GitHub Pages Deployment Guide

## Overview
The Invoke documentation is automatically deployed to GitHub Pages whenever changes are pushed to the `docs/` folder.

## Workflow Configuration
- **File**: `.github/workflows/docs-deploy.yml`
- **Trigger**: Push to `main` or `master` branch with changes in:
  - `docs/**` (documentation files)
  - `.github/workflows/docs-deploy.yml` (workflow file itself)
- **Action**: Builds Docusaurus site and deploys to GitHub Pages

## Setup Instructions

### 1. Repository Configuration
Ensure the following is configured in your GitHub repository:

#### Enable GitHub Pages
1. Go to Repository Settings → Pages
2. **Source**: Deploy from a branch
3. **Branch**: Select `gh-pages` from the dropdown
4. **Folder**: Select `/ (root)`
5. Click **Save**

#### Configure Deployment Permissions
The workflow uses GitHub's OIDC provider for deployment. No additional secrets are needed.

### 2. Update Docusaurus Config (if needed)
In `docs/docusaurus.config.ts`, verify:

```typescript
url: 'https://<your-github-username>.github.io',  // Your GitHub Pages URL
baseUrl: '/invoke/',  // Repository name
organizationName: '<your-github-username>',  // GitHub username
projectName: 'invoke',  // Repository name
deploymentBranch: 'gh-pages',  // Branch for deployment
```

Replace `<your-github-username>` with your actual GitHub username.

### 3. First Time Setup
1. Ensure `gh-pages` branch doesn't exist (workflow will create it)
2. Make a commit with changes in `docs/` folder
3. Push to `main` or `master` branch
4. Workflow will automatically:
   - Build Docusaurus
   - Deploy to `gh-pages` branch
   - GitHub Pages will publish the site

## Accessing Your Documentation
After successful deployment, your documentation will be available at:
```
https://<your-github-username>.github.io/invoke/
```

## Workflow Details

### Build Job
- Runs on: `ubuntu-latest`
- Steps:
  1. Checkout code
  2. Setup Node.js 18
  3. Install dependencies from `docs/package-lock.json`
  4. Run build: `npm run build`
  5. Upload build artifacts to GitHub Pages

### Deploy Job
- Waits for build job to complete
- Deploys artifacts to GitHub Pages
- Sets environment URL for workflow display

## Triggering Deployments

### Automatic
Push changes to `docs/` folder on `main` or `master`:
```bash
git add docs/
git commit -m "Update documentation"
git push origin main
```

### Manual (if needed)
1. Go to Actions tab
2. Select "Deploy Docs to GitHub Pages" workflow
3. Click "Run workflow"
4. Select branch: `main` or `master`
5. Click "Run workflow"

## Monitoring Deployments
1. Go to GitHub repository **Actions** tab
2. Find "Deploy Docs to GitHub Pages" workflow
3. Click the workflow run to see details:
   - Build logs
   - Deployment status
   - Live URL

## Troubleshooting

### Workflow not triggered
- **Check**: Push committed changes to `docs/` folder
- **Check**: Branch is `main` or `master`
- **Check**: Workflow file exists at `.github/workflows/docs-deploy.yml`

### Build fails
- **Check**: `docs/package-lock.json` exists
- **Run locally**: `cd docs && npm ci && npm run build`
- **Fix**: Resolve npm errors and push again

### Site not published
- **Check**: GitHub Pages enabled in Settings → Pages
- **Check**: Branch set to `gh-pages` with `/ (root)` folder
- **Wait**: GitHub Pages may take 1-2 minutes to publish

### Broken styles/assets
- **Check**: `baseUrl` matches repository name in `docusaurus.config.ts`
- **Check**: All internal links use relative paths
- **Rebuild**: Make a change to docs and push to trigger rebuild

## Performance Notes

### Build Cache
- Node.js dependencies are cached using `actions/setup-node@v4`
- Cache is keyed by `package-lock.json`
- Builds are typically fast (< 2 minutes)

### Concurrency
- Only one deployment runs at a time
- Older deployments are cancelled when new push detected
- Prevents race conditions

## Customization

### Change Trigger (e.g., only main branch)
Edit `.github/workflows/docs-deploy.yml`:
```yaml
on:
  push:
    branches:
      - main  # Only main branch
    paths:
      - 'docs/**'
```

### Change Node Version
Edit `.github/workflows/docs-deploy.yml`:
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'  # Change to desired version
```

### Disable Workflow Temporarily
- Rename file: `.github/workflows/docs-deploy.yml` → `.github/workflows/docs-deploy.yml.disabled`
- Or delete the workflow file

## Additional Resources
- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docusaurus Deployment Guide](https://docusaurus.io/docs/deployment)
