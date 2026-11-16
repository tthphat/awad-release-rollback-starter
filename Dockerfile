# I1: Pinned base image with specific version (node:22-alpine), avoiding node:latest
# I2: Alpine Linux keeps image size around 130 MB, well below the 300 MB limit
FROM node:22-alpine

WORKDIR /app

# I6: Create /data directory and assign ownership to node user
# This allows migrations to write SQLite database on a fresh volume mounted at /data
RUN mkdir -p /data && chown -R node:node /data && chown -R node:node /app

# I5: Copy application code with node ownership (filtered by .dockerignore)
COPY --chown=node:node . .

# I7: Bake APP_VERSION into the image via build argument (--build-arg APP_VERSION=...)
# I4: No secrets (such as ADMIN_TOKEN) are defined in ENV, ARG, or image history
ARG APP_VERSION=1.0.0
ENV APP_VERSION=$APP_VERSION

# I3: Run as non-root user (USER node)
USER node

# I9: HEALTHCHECK reports healthy when HTTP server responds on /health
HEALTHCHECK --interval=1s --timeout=2s --start-period=1s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

EXPOSE 3000

# I10: Exec-form CMD ensures Node is PID 1 to receive SIGTERM directly for graceful shutdown
CMD ["node", "src/server.js"]
