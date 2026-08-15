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

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

WORKDIR /dsh
COPY . .

RUN pnpm install --frozen-lockfile --prefer-offline
RUN pnpm run build:lib

EXPOSE 3080
ENTRYPOINT ["node", "apps/cli/lib/bin.js"]
CMD ["web", "--port", "3080"]
