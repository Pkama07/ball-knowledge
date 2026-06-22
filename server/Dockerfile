# Ball Knowledge game server — production image.
#
# Multi-stage build. The repo is an npm-workspaces monorepo; the server depends
# on the `@ball-knowledge/shared` workspace, so we build `shared` and `server`
# together, then ship a slim runtime with only the server's production deps.
#
# This Dockerfile lives in server/ but is built from the REPO ROOT as context
# (docker-compose.yml sets `context: ..`), so every COPY path below is relative
# to the repo root. The matching ignore file is server/Dockerfile.dockerignore.

# ---- Stage 1: build ---------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Copy only manifests first so `npm ci` is cached unless deps change.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci

# Build the two workspaces we actually deploy (skips the Next.js client).
COPY shared ./shared
COPY server ./server
RUN npm run build --workspace @ball-knowledge/shared --workspace @ball-knowledge/server

# ---- Stage 2: runtime -------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Install only the server's production dependencies (ws, jose). This also wires
# the `@ball-knowledge/shared` workspace symlink that the compiled server imports
# at runtime — which resolves to shared/dist via the "node" export condition.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci --omit=dev --workspace @ball-knowledge/server --include-workspace-root \
    && npm cache clean --force

# Compiled output from the build stage.
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/dist ./server/dist

EXPOSE 4000
USER node

# Container-level liveness check against the HTTP /health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
