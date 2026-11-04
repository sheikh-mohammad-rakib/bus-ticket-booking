# Riders — bus ticket booking (Bangladesh)
# Single-service container: API + built React app, PostgreSQL via DATABASE_URL.

FROM node:24-alpine

# npx/read timeouts: npm retries the flaky-parts of slow networks instead of
# dying with EIDLETIMEOUT midway through a fresh install.
ENV NPM_CONFIG_FETCH_RETRIES=8 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=3 \
    NPM_CONFIG_FETCH_TIMEOUT=180000

WORKDIR /app

# Manifests only — layer-cached, and the deps layers below re-run on bumps
# (not on source edits). Lockfiles exist, so npm ci stays deterministic.
COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json server/
COPY client/package.json client/package-lock.json client/

# Server runtime deps (no dev). --prefer-offline serves from the seeded npm
# cache when present (and skips stale-metadata revalidation on providers);
# anything missing falls through to the registry.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --prefer-offline --prefix server

# Client deps (includes build tools like vite)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline --prefix client

# Now source + build. Note: no root npm install — the root package only adds
# `concurrently` (a dev-only helper) which the image never runs.
COPY server server
COPY client client
RUN --mount=type=cache,target=/root/.npm \
    npm run build

ENV NODE_ENV=production
EXPOSE 4000

# The API creates its schema and seeds BD routes on first boot, so a fresh
# Postgres instance (volume, managed service) needs no migration steps.
CMD ["node", "server/src/index.js"]
