#!/usr/bin/env bash

readonly DOWNLOAD_PATH
readonly REPO
readonly VERSION
readonly PLATFORMS
readonly FILES

readonly linux_amd64="linux/amd64"
readonly linux_arm64="linux/arm64"
readonly context=$(mktemp -d)

echo "context=$context" >> "$GITHUB_OUTPUT"

function prepare() {
  local platform="$1"
  local target="$2"

  local tmp=$(mktemp -d)
  unzip "$DOWNLOAD_PATH/${REPO#*/}-$VERSION-$target-standalone.zip" -d "$tmp"

  local output="$context/$platform"
  mkdir -p "$output"
  for file in $FILES; do cp "$tmp/$file" "$output"; done
}

for platform in $PLATFORMS; do
  case "$platform" in
    "$linux_amd64")
      prepare "$linux_amd64" "x86_64-unknown-linux-musl"
    ;;
    "$linux_arm64")
      prepare "$linux_arm64" "aarch64-unknown-linux-musl"
    ;;
    *)
      echo "error: Unsupported Docker platform specifier $platform"
      exit 1
    ;;
  esac
done
