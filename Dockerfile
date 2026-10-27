# Tofu (2026-10-27): this file is Tofu's addition. See TOFU.md.
#
# One image for Tofu's container hosting: the web app (client/), built as
# client/Dockerfile builds it, served by the Express server (server/), built as
# server/Dockerfile builds it, from the same process and port as /api and the
# live-update WebSocket on /ws (upstream's SERVE_CLIENT_DIR, the way its Windows
# install runs). Upstream's two images and docker-compose.yml are unchanged.
#
# Nothing here runs a repository file directly: the builds and the server start
# through npm and node, because Tofu's import does not keep file modes.

# Build stage: both workspaces' dependencies at the lockfile's versions, then
# shared, the server (TypeScript to dist/) and the web app (Vite to dist/).
FROM node:26-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared/package.json ./shared/

# --include=dev keeps typescript and vite installed even when the build
# environment sets NODE_ENV=production.
RUN npm ci --include=dev

COPY shared ./shared
COPY server ./server
COPY client ./client
COPY tsconfig.json ./

RUN cd shared && npm run build
RUN cd server && npm run build
# Same origin for the API and the WebSocket (VITE_API_URL and VITE_WS_URL
# empty), as client/Dockerfile builds it by default.
RUN cd client && npm run build

# Production stage: the server's production dependencies only, its build and
# the web app's build. It runs as root, because Tofu's PORT is 80 unless the app
# sets another, and only root may listen on a port below 1024.
FROM node:26-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
COPY shared/package.json ./shared/

RUN npm ci --omit=dev --workspace=server --workspace=shared --include-workspace-root \
    && npm cache clean --force

COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

ENV NODE_ENV=production
# The server serves the web app itself, with the CSP upstream wrote for it.
ENV SERVE_CLIENT_DIR=/app/client/dist

# The server listens on PORT (Tofu sets it), else SERVER_PORT, else 3001.
EXPOSE 80

CMD ["node", "server/dist/index.js"]
