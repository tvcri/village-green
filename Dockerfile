# Village Green
#
# COPY commands assume the following lines in .dockerignore
# **/node_modules
# **/state.json
# **/README.md
# **/.git
# **/.gitignore
# **/data
# **/docs
# **/test
# **/uploads
# **/docker

ARG BASE_IMAGE="node:lts-alpine"

# Build stage: compile Vue client
FROM ${BASE_IMAGE} AS builder
WORKDIR /home/node
USER node

COPY --chown=node:node ./client ./client
WORKDIR /home/node/client
RUN npm ci
RUN npm run build

# Final stage: API server with built client
FROM ${BASE_IMAGE}
LABEL maintainer="csmig@csmig.com"
ARG COMMIT_BRANCH=""
ARG COMMIT_SHA=""
ARG COMMIT_TAG=""
ARG COMMIT_DESCRIBE=""
LABEL commit-branch=${COMMIT_BRANCH}
LABEL commit-sha=${COMMIT_SHA}
LABEL commit-tag=${COMMIT_TAG}
LABEL commit-describe=${COMMIT_DESCRIBE}

WORKDIR /home/node
USER node

# Install app dependencies
COPY --chown=node:node ./api/source .
RUN npm ci

# Copy built client from builder stage
COPY --from=builder --chown=node:node /home/node/client/dist ./client

# Ensure sticky bit is set on all world-writable directories (fixes tenable 1000749)
USER root
RUN df -P | awk {'if (NR!=1) print $6'} | xargs -I '{}' find '{}' -xdev -type d -perm -0002 2>/dev/null | xargs chmod a+t 2>/dev/null | echo 'tenable 1000749'
USER node

# Set environment
ENV COMMIT_SHA=${COMMIT_SHA} \
COMMIT_BRANCH=${COMMIT_BRANCH} \
COMMIT_TAG=${COMMIT_TAG} \
COMMIT_DESCRIBE=${COMMIT_DESCRIBE} \
STIGMAN_CLIENT_DIRECTORY=./client \
STIGMAN_DOCS_DIRECTORY=./docs

EXPOSE 64000
CMD [ "node", "index.js" ]
