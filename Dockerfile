# syntax=docker/dockerfile:1
# Private invite-only playtest server (docs/deployment.md). The image defaults
# to public mode, so a misconfigured deploy refuses to start instead of
# running open.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY tools ./tools
RUN npm run build:hosted && npm run build:server

FROM node:22-bookworm-slim
ARG RAILWAY_GIT_COMMIT_SHA=""
ENV NODE_ENV=production \
    THREEFOLD_PUBLIC=1 \
    THREEFOLD_HOST=0.0.0.0 \
    PORT=8080 \
    THREEFOLD_SAVE=/data/world.json \
    THREEFOLD_CLIENT_DIR=/app/dist/hosted \
    THREEFOLD_RELEASE=${RAILWAY_GIT_COMMIT_SHA}
WORKDIR /app
COPY --from=build /app/dist/server ./dist/server
COPY --from=build /app/dist/hosted ./dist/hosted
RUN mkdir -p /data && chown node:node /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Hosts may mount the volume as root: fix its ownership, then drop to the
# unprivileged node user and exec node, so node is PID 1 and receives SIGTERM
# directly (never through npm). Saving on shutdown depends on that signal.
CMD ["/bin/sh", "-c", "chown -R node:node /data 2>/dev/null || true; exec setpriv --reuid=node --regid=node --init-groups node dist/server/main.mjs"]
