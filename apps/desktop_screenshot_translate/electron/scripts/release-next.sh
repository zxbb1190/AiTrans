#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: bash scripts/release-next.sh [--skip-checks]

Runs the release flow for the Electron app.

- In the monorepo, it validates the app, commits Electron changes, pushes the current branch to origin,
  splits the Electron subtree, then pushes the standalone commit and tag to the public repo.
- In the standalone repo, it validates the app, commits repo changes, pushes the current branch to origin,
  and pushes the matching version tag to origin.

Options:
  --skip-checks   Skip npm validation commands.
  -h, --help      Show this help.
USAGE
}

log() {
  printf '[release-next] %s\n' "$*"
}

fail() {
  printf '[release-next] ERROR: %s\n' "$*" >&2
  exit 1
}

skip_checks=0

while (($# > 0)); do
  case "$1" in
    --skip-checks)
      skip_checks=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_root="$(cd "$script_dir/.." && pwd)"
repo_root="$(git -C "$app_root" rev-parse --show-toplevel)"
electron_rel="apps/desktop_screenshot_translate/electron"
monorepo_app_root="$repo_root/$electron_rel"

mode="standalone"
stage_path="."
public_remote="${PUBLIC_REMOTE:-origin}"
public_branch="${PUBLIC_BRANCH:-main}"

if [[ "$app_root" == "$monorepo_app_root" ]]; then
  mode="monorepo"
  stage_path="$electron_rel"
  public_remote="${PUBLIC_REMOTE:-public}"
fi

current_branch="$(git -C "$repo_root" rev-parse --abbrev-ref HEAD)"
[[ "$current_branch" != "HEAD" ]] || fail "detached HEAD is not supported for release publishing"

version="$(node -p "require(process.argv[1]).version" "$app_root/package.json")"
[[ -n "$version" ]] || fail "failed to read version from package.json"

tag_name="v$version"
notes_path="$app_root/release-notes/$version.md"
[[ -f "$notes_path" ]] || fail "missing release notes: $notes_path"

run_checks() {
  log "running release validation for $tag_name"
  (
    cd "$app_root"
    npm run materialize:project
    npm run check
    npm run doctor
    npm run release:check
  )
}

if (( skip_checks == 0 )); then
  run_checks
else
  log "skipping npm validation commands"
fi

status_output="$(git -C "$repo_root" status --porcelain -- "$stage_path")"
if [[ -n "$status_output" ]]; then
  log "staging release changes under $stage_path"
  git -C "$repo_root" add -- "$stage_path"

  if ! git -C "$repo_root" diff --cached --quiet -- "$stage_path"; then
    log "creating release commit $tag_name"
    git -C "$repo_root" commit -m "release: $tag_name"
  else
    log "no staged diff remained after add; skipping commit"
  fi
else
  log "no local changes detected under $stage_path; reusing current commit"
fi

log "pushing $current_branch to origin"
git -C "$repo_root" push origin "$current_branch"

if [[ "$mode" == "standalone" ]]; then
  log "pushing $tag_name to origin"
  git -C "$repo_root" push origin "HEAD:refs/tags/$tag_name"
  log "release publish request sent to origin for $tag_name"
  exit 0
fi

git -C "$repo_root" remote get-url "$public_remote" >/dev/null 2>&1 \
  || fail "missing public remote: $public_remote"

log "splitting standalone subtree from $electron_rel"
subtree_sha="$(git -C "$repo_root" subtree split --prefix="$electron_rel" HEAD)"
[[ -n "$subtree_sha" ]] || fail "subtree split did not return a commit SHA"

log "pushing standalone commit $subtree_sha to $public_remote/$public_branch"
git -C "$repo_root" push "$public_remote" "$subtree_sha:$public_branch"

log "pushing $tag_name to $public_remote"
git -C "$repo_root" push "$public_remote" "$subtree_sha:refs/tags/$tag_name"

log "release publish request sent to $public_remote for $tag_name"
