#!/bin/sh
# Moves the major tag of a release (v1 for v1.2.3) to the release and pushes it
# to origin. Skips, with a notice, a release that is not the highest of its
# major, so that the promotion of an older prerelease (v1.1.0-rc1 after v1.3.0)
# never moves the major tag backwards. It needs every tag fetched.
# .github/workflows/release.yml runs it; __tests__/major-tag.test.ts tests it.
#
# Usage: sh script/major-tag.sh <release tag>

set -eu

tag_name="$1"
major="${tag_name%%.*}"

if ! printf '%s' "$major" | grep -Eq '^v[0-9]+$'; then
  echo "::error::Release tag $tag_name does not start with vMAJOR."
  exit 1
fi

if ! git rev-parse -q --verify "refs/tags/$tag_name" > /dev/null; then
  echo "::error::Release tag $tag_name is not fetched."
  exit 1
fi

# versionsort.suffix=- sorts v1.1.0-rc1 before v1.1.0. No pipeline, so that
# set -e stops the script when git fails.
tags="$(git -c versionsort.suffix=- tag --list "$major.*" --sort=-v:refname)"
highest="$(printf '%s\n' "$tags" | head -n 1)"

if [ "$tag_name" != "$highest" ]; then
  echo "::notice::Release $tag_name is not the highest $major release ($highest), so $major does not move."
  exit 0
fi

git tag -fa "$major" -m "Update $major tag" "$tag_name^{commit}"
git push origin "$major" --force
