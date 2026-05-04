#!/bin/sh

# Get the absolute path of the directory where this script lives
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

# Define the build context (the parent directory) as an absolute path
BUILD_CONTEXT=$(dirname "$SCRIPT_DIR")

# Execute docker build
# "$@" appends all arguments passed to this script (e.g., --no-cache) to the end
docker build \
  -t ghcr.io/brian9206/invoke/runtime:latest \
  -f "$SCRIPT_DIR/Dockerfile" \
  "$BUILD_CONTEXT" "$@"