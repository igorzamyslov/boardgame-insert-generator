#!/usr/bin/env bash
# scripts/release.sh — the release workflow's step: tag and release the version in package.json
# if its tag does not exist yet. Needs `gh` signed in (GH_TOKEN) and a checkout of the commit.
#
# Environment: GITHUB_REPOSITORY, SUBJECT_SHA (the commit to tag, default HEAD),
# BEFORE (the commit before the push; the run does nothing if the version is unchanged since),
# DRY_RUN=1 (print what would be created).
set -euo pipefail

sha="${SUBJECT_SHA:-$(git rev-parse HEAD)}"
version="$(node -p "require('./package.json').version")"
tag="v${version}"

if [[ -n "${BEFORE:-}" && "${BEFORE}" != 0000000000000000000000000000000000000000 ]]; then
  before_version="$(git show "${BEFORE}:package.json" 2>/dev/null | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).version" 2>/dev/null || true)"
  if [[ "${before_version}" == "${version}" ]]; then
    echo "release: version ${version} did not change in this push, nothing to do"
    exit 0
  fi
fi

if gh release view "${tag}" >/dev/null 2>&1 || [[ -n "$(git ls-remote --tags origin "refs/tags/${tag}")" ]]; then
  echo "release: ${tag} exists, nothing to do"
  exit 0
fi

subject="$(git log -1 --format=%s "${sha}")"
title="$(node scripts/changelog.mjs title "${version}" "${subject}")"
notes_file="$(mktemp)"
notes_args=(--notes-file "${notes_file}")
if ! node scripts/changelog.mjs notes "${version}" > "${notes_file}"; then
  echo "::warning::CHANGELOG.md has no section for ${version}; using generated notes"
  notes_args=(--generate-notes)
fi

echo "release: ${tag} on ${sha}: ${title}"
if [[ "${DRY_RUN:-}" == 1 ]]; then
  [[ "${notes_args[0]}" == --notes-file ]] && cat "${notes_file}"
  exit 0
fi
gh release create "${tag}" --target "${sha}" --title "${title}" "${notes_args[@]}"
