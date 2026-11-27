# syntax=docker/dockerfile:1
#
# Web image: Expo's web export served by Caddy.
#
# Compose builds it with app/ as the context (see compose.yaml):
#   docker compose build web      (from compose/)
# EXPO_PUBLIC_API_BASE_URL is a build argument because Expo inlines it into the
# bundle at export time: the public origin is BAKED IN, so a new DOMAIN needs a
# rebuild of this image. The build stage (node, node_modules, the Expo toolchain)
# never reaches the runtime image: the last stage copies only dist/.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG EXPO_PUBLIC_API_BASE_URL
ENV EXPO_PUBLIC_API_BASE_URL=${EXPO_PUBLIC_API_BASE_URL}
RUN npm run export:web

FROM caddy:2
COPY --from=build /app/dist /srv
