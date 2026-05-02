# GitHub Setup Checklist for lhx-kit

> One-time setup to enable CI + releases. Work through this list in order.
> Everything marked P0 must be done for CI to even run; P1 is safety +
> governance; P2 is polish.

## 🔴 P0 — Required

### 1. Push initial commit

```bash
cd <repo-root>
git add .
git commit -m "feat: initial lhx-kit release scaffolding"
git branch -M master
git remote add origin git@github.com:juwenzhang/lhx-kit.git  # skip if already added
git push -u origin master
```

Without at least one commit on `master`, `changesets` cannot compute diffs
and the release workflow will error on first run.

### 2. NPM_TOKEN (publish secret)

1. Log in to [npmjs.com](https://www.npmjs.com) with the account that
   owns the `@lhx-kit` scope.
2. Profile avatar → **Access Tokens** → **Generate New Token**.
3. Choose **Classic Token** → **Automation**.
4. Copy the token — it is shown only once.
5. GitHub repo → **Settings** → **Secrets and variables** → **Actions**
   → **New repository secret**.
   - **Name**: `NPM_TOKEN`
   - **Value**: paste the token.

> 💡 "Automation" scope bypasses the 2FA prompt needed by CI while
> keeping the blast radius small (it cannot sign in to the npm website).

### 3. Allow GitHub Actions to open PRs

Changesets Action opens a "Version Packages" PR automatically; default
`GITHUB_TOKEN` permissions are too weak.

1. Repo → **Settings** → **Actions** → **General**.
2. Under **Workflow permissions**, pick **Read and write permissions**.
3. Tick ☑️ **Allow GitHub Actions to create and approve pull requests**.
4. **Save**.

Without this step the release job fails with
`403: Resource not accessible by integration`.

### 4. Configure GitHub Pages (for docs)

`.github/workflows/rspress-docs-ci-cd.yaml` deploys to GitHub Pages.

1. Repo → **Settings** → **Pages**.
2. **Source**: **GitHub Actions** (NOT "Deploy from a branch").
3. The first run of the docs workflow will provision the Pages site at
   `https://<user>.github.io/lhx-kit/`.

---

## 🟡 P1 — Strongly recommended

### 5. Branch protection on `master`

Repo → **Settings** → **Branches** → **Add branch protection rule**:

- **Branch name pattern**: `master`
- ☑️ Require a pull request before merging
  - Require approvals: **1** (or more)
  - ☑️ Dismiss stale pull-request approvals when new commits are pushed
- ☑️ Require status checks to pass before merging
  - Add the `ci` workflow checks (typecheck, biome, test)
- ☑️ Require conversation resolution before merging
- ☑️ Require linear history (forces rebase/squash; no merge commits)
- ☑️ Do not allow bypassing the above settings (applies to admins too)

### 6. REPO_PUSH_TOKEN (when branch protection is on)

Default `GITHUB_TOKEN` cannot push to a protected branch. If you want
Changesets to create version tags, provision a fine-grained PAT.

1. GitHub → **Settings** (personal, not repo) → **Developer settings**
   → **Personal access tokens** → **Fine-grained tokens** → **Generate
   new token**.
2. Settings:
   - **Resource owner**: you.
   - **Repository access**: **Only selected repositories** → tick
     `lhx-kit`.
   - **Permissions**:
     - Contents: **Read and write**
     - Pull requests: **Read and write**
     - Metadata: **Read-only** (auto-selected)
3. Copy token → repo **Settings** → **Secrets** → **Actions** → new
   secret `REPO_PUSH_TOKEN`.

The release workflow uses `REPO_PUSH_TOKEN || GITHUB_TOKEN` as a safe
fallback, so this step is optional if you skip (5).

### 7. Enable Code security features

Repo → **Settings** → **Code security and analysis**:

- ☑️ Dependency graph
- ☑️ Dependabot alerts
- ☑️ Dependabot security updates
- ☑️ Secret scanning (enterprise free accounts have this now)
- ☑️ Push protection (blocks commits containing secrets)

Our `.github/dependabot.yml` activates automatically once the file is
on `master`.

---

## 🟢 P2 — Polish

### 8. Enable Discussions

Repo → **Settings** → **General** → **Features** → ☑️ **Discussions**.

Our `.github/ISSUE_TEMPLATE/config.yml` already links users to
Discussions for Q&A, keeping Issues focused on bugs + feature asks.

### 9. Repo About / Topics

Top-right of repo homepage → the ⚙️ next to "About":

- **Description**: `lhx-kit: CLI + runtime + renderer for production-ready MPA projects with offline packaging`
- **Website**: `https://juwenzhang.github.io/lhx-kit/`
- **Topics**: `cli`, `scaffold`, `vite`, `mpa`, `monorepo`, `react19`,
  `vue3`, `offline`, `cdn`, `changesets`, `ai-skills`

Topics help discovery. A good description shows up on `npm` package
pages that link back here.

### 10. Social preview image

Repo → **Settings** → **General** → **Social preview** →
**Upload image** (recommended: **1280 × 640 PNG**).

Renders when the repo link is shared on Twitter/WeChat/Slack.

### 11. Default branch name

If the GitHub repo was created with `main` as default but our
`.changeset/config.json` says `master`, either:

- Rename on GitHub: **Settings** → **General** → **Default branch** → pencil icon → type `master`
- OR change `.changeset/config.json#baseBranch` to `main`

Pick one and be consistent.

---

## 🚦 Going from "private dress rehearsal" to "public release"

The kit is currently set up with `"private": true` on every publishable
package — Changesets won't actually publish to npm in this state. When
ready to flip the switch:

```bash
# 1. Remove `"private": true` from every publishable package
for f in packages/*/package.json; do
  node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('$f', 'utf8'));
    delete p.private;
    fs.writeFileSync('$f', JSON.stringify(p, null, 2) + '\n');
  "
done

# 2. Verify
grep '"private"' packages/*/package.json
# Expected: (no output)

# 3. Commit + push + write a changeset
pnpm changeset
git add .
git commit -m "chore: remove private flag, ready for public release"
git push

# 4. CI opens the "Version Packages" PR
# 5. Merge that PR → CI runs `pnpm release` → packages land on npm
```

---

## 🔍 Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `403 Resource not accessible by integration` during release | Workflow permissions not enabled | Do (3) |
| `ENEEDAUTH` during `changeset publish` | `NPM_TOKEN` missing / wrong scope | Re-do (2) with **Automation** token |
| Version Packages PR doesn't open | No pending changeset files committed | `pnpm changeset` + commit |
| Docs site 404s after deploy | Pages source not set to "GitHub Actions" | Do (4) |
| `Failed to find where HEAD diverged from "master"` | master has no commits yet | Do (1) |
| `@lhx-kit/xxx@workspace:* not found` when user installs | Forgot to unfold workspace ranges before publish | Changesets does this for you; only manual `npm publish` hits this |
