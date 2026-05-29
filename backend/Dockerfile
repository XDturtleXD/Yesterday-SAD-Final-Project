# syntax=docker/dockerfile:1.7
#
# Yesterday backend (Express 5, CommonJS) — production image.
#
# Build from the repo root with:
#   docker build -t yesterday-backend ./backend
#
# Notes:
# - bcrypt ships musl prebuilds for x64 Alpine via node-pre-gyp; the prebuilt
#   binary is used automatically and `--ignore-scripts` is fine here. If
#   bcrypt's prebuild ever stops matching the target arch, switch to
#   `node:22-slim` (glibc) or add a builder stage that runs:
#     apk add --no-cache --virtual .build-deps python3 make g++
#     npm rebuild bcrypt --build-from-source
#     apk del .build-deps

FROM node:22-alpine

WORKDIR /app

# Install ONLY production deps. `--ignore-scripts` skips package lifecycle
# scripts; the bcrypt prebuilt binary is downloaded by `npm ci` itself via
# node-pre-gyp's install step which runs even with --ignore-scripts off; if
# it doesn't, drop the flag.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
 && npm cache clean --force

# Copy application sources only (the .dockerignore drops tests, .env, etc.).
COPY src ./src

ENV NODE_ENV=production \
    PORT=3001

EXPOSE 3001

# Drop root for the runtime process.
USER node

CMD ["node", "src/server.js"]
