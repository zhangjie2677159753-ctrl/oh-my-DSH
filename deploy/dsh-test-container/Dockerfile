# Controlled test environment for omo-dsh G1 mount verification.
# Build context: deepseek-harness checkout tarball (no .git / node_modules).
# This container boots a FRESH DSH with the local checkout's code — it never
# touches the running host deployment or its credentials.
FROM node:22-bookworm-slim

ARG HTTP_PROXY
ARG HTTPS_PROXY
ENV HTTP_PROXY=${HTTP_PROXY} \
    HTTPS_PROXY=${HTTPS_PROXY} \
    NO_PROXY=localhost,127.0.0.1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

WORKDIR /dsh
COPY src/ .
COPY omo-plugin/ /dsh/omo-plugin/
# The plugin tree must be world-readable: the container runs as the host uid.
RUN chmod -R a+rX /dsh/omo-plugin
# The preset plugin's bare @deepseek-ai/* imports resolve through real
# package-entry symlinks (Node ESM follows entry symlinks, but not a wholly
# symlinked node_modules directory; the root install does not link workspace
# packages under /dsh/node_modules/@deepseek-ai).
RUN mkdir -p /dsh/omo-plugin/node_modules/@deepseek-ai \
    && ln -s /dsh/packages/core/tools /dsh/omo-plugin/node_modules/@deepseek-ai/dsh-tools \
    && ln -s /dsh/vendor/schemastery /dsh/omo-plugin/node_modules/@deepseek-ai/schemastery \
    && ln -s /dsh/packages/terminal/terminal-bash /dsh/omo-plugin/node_modules/@deepseek-ai/dsh-terminal-bash \
    && ln -s /dsh/packages/terminal/tool-terminal /dsh/omo-plugin/node_modules/@deepseek-ai/dsh-tool-terminal

# lefthook's postinstall requires a git repository (rev-parse); init one so
# lifecycle scripts succeed without touching any real repo.
RUN git init -q -b main \
    && git config user.email "build@local" \
    && git config user.name "build"

RUN pnpm install --frozen-lockfile --prefer-offline
RUN pnpm run build:lib
# the web profile requires the frontend dist bundle
RUN pnpm run build:web

EXPOSE 3080
ENTRYPOINT ["node", "apps/cli/lib/bin.js"]
CMD ["web", "--port", "3080"]
