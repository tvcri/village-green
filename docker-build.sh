#!/bin/bash

# This script must be run from the top-level of the repo.

# (cd client && npm ci && npm run build)

BRANCH=$(git symbolic-ref --short HEAD)
SHA=$(git rev-parse --short=10 HEAD)
DESCRIBE=$(git describe --tags)
TAG=$(git describe --tags --abbrev=0)

docker build \
  --build-arg=COMMIT_BRANCH=$BRANCH \
  --build-arg=COMMIT_SHA=$SHA \
  --build-arg=COMMIT_DESCRIBE=$DESCRIBE \
  --build-arg=COMMIT_TAG=$TAG \
  --no-cache=true \
  --tag village-green:$TAG .

docker tag village-green:$TAG village-green:latest
