# GitHub Pages Setup Checklist

## Quick Setup Guide

### Step 1: Configure GitHub Pages Settings
- [ ] Go to GitHub repository **Settings** → **Pages**
- [ ] Set **Source** to "Deploy from a branch"
- [ ] Select **Branch**: `gh-pages`
- [ ] Select **Folder**: `/ (root)`
- [ ] Click **Save**

### Step 2: Update GitHub Username (if needed)
Edit `docs/docusaurus.config.ts` and update:
- [ ] `url`: Replace `brianchoi` with your GitHub username
- [ ] `organizationName`: Replace `brianchoi` with your GitHub username

Example:
```typescript
url: 'https://YOUR-USERNAME.github.io',
organizationName: 'YOUR-USERNAME',
```

### Step 3: Verify Workflow File
- [ ] Confirm `.github/workflows/docs-deploy.yml` exists
- [ ] Confirm it has the correct `on` triggers (main/master branch, docs/ path)

### Step 4: First Push
- [ ] Make a commit with docs changes:
  ```bash
  cd /path/to/invoke
  git add .github/workflows/docs-deploy.yml docs/docusaurus.config.ts
  git commit -m "Configure GitHub Pages deployment"
  git push origin main
  ```

### Step 5: Wait for Deployment
- [ ] Go to **Actions** tab
- [ ] Wait for "Deploy Docs to GitHub Pages" workflow to complete (usually 2-3 minutes)
- [ ] Check for ✅ on the workflow run

### Step 6: Access Your Site
Your documentation will be available at:
```
https://YOUR-USERNAME.github.io/invoke/
```

## Verify It's Working

1. **Check GitHub Pages Status**
   - Settings → Pages → Should show: "Your site is live at https://..."

2. **Check Workflow Runs**
   - Actions tab → "Deploy Docs to GitHub Pages"
   - Recent runs should show ✅ (green checkmarks)

3. **Test the Site**
   - Visit `https://YOUR-USERNAME.github.io/invoke/`
   - Navigate around to ensure styles and links work

## Automated Workflow Behavior

✅ **Workflow RUNS when:**
- Push to `main` or `master` branch
- Changes include files in `docs/` folder
- Examples:
  - `docs/docs/intro.md` changed → ✅ Runs
  - `docs/docusaurus.config.ts` changed → ✅ Runs
  - `docs/package.json` changed → ✅ Runs
  - Workflow file `.github/workflows/docs-deploy.yml` changed → ✅ Runs

❌ **Workflow SKIPS when:**
- Changes only in other folders:
  - `invoke-admin/` changed but not `docs/` → ❌ Skips
  - `invoke-execution/` changed → ❌ Skips
  - `README.md` changed → ❌ Skips

## Future Deployments

Once set up, documentation deploys automatically:

1. **Make changes** to documentation:
   ```bash
   # Edit docs
   vim docs/docs/guides/example.md
   ```

2. **Commit and push**:
   ```bash
   git add docs/
   git commit -m "Update example guide"
   git push origin main
   ```

3. **Workflow runs automatically**
   - Check Actions tab to see progress
   - Site updates in 2-3 minutes

4. **Done!** Your changes are live

## Troubleshooting

### "Workflow doesn't run"
- ✓ Check push was to `main` or `master` (not other branch)
- ✓ Check changes include `docs/` folder files
- ✓ Check workflow file exists: `.github/workflows/docs-deploy.yml`

### "Build fails with npm errors"
- ✓ Run locally: `cd docs && npm ci && npm run build`
- ✓ Fix errors then push again

### "Site shows broken styles"
- ✓ Update `baseUrl` in `docs/docusaurus.config.ts`
- ✓ Ensure it matches your repository name: `/invoke/`

### "Site doesn't get published"
- ✓ GitHub Pages Settings → verify branch is `gh-pages`
- ✓ Wait 1-2 minutes for GitHub to build
- ✓ Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)

## Additional Files

- **Workflow**: `.github/workflows/docs-deploy.yml` - CI/CD configuration
- **Deployment Guide**: `.github/DEPLOYMENT.md` - Detailed documentation
- **Config**: `docs/docusaurus.config.ts` - Docusaurus settings for GitHub Pages
- **No Jekyll**: `docs/static/.nojekyll` - Prevents Jekyll processing

## Need Help?

For detailed information, see `.github/DEPLOYMENT.md` in the repository.
