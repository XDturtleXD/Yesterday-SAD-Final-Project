# syntax=docker/dockerfile:1.7
#
# Yesterday frontend (React 19 + Vite + TS) — production image.
#
# Build from the repo root:
#   docker build \
#     --build-arg VITE_API_URL=/api \
#     --build-arg VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
#     -t yesterday-frontend .
#
# Vite reads `VITE_*` at BUILD TIME and inlines them into the bundle, so they
# must be passed via --build-arg (not docker run -e).
#
# Stage 1 produces dist/; Stage 2 ships it via nginx, which also proxies
# /api/* to the backend container on the docker-compose network.

# ---------- Stage 1: build the Vite bundle ----------
FROM node:22-alpine AS builder

WORKDIR /app

ARG VITE_API_URL=/api
ARG VITE_GOOGLE_CLIENT_ID=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

# The root postinstall script runs `npm install --prefix backend`, which we
# don't want in the frontend image; --ignore-scripts skips it.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Only the files needed for the Vite build.
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY vite.config.ts eslint.config.js index.html ./
COPY public ./public
COPY src ./src

RUN npm run build

# ---------- Stage 2: nginx serves the static bundle ----------
FROM nginx:1.27-alpine AS runtime

# SPA-friendly nginx config: SPA fallback + /api proxy to backend service.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# nginx's default CMD already starts the server in the foreground.
