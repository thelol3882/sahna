# The deck remote in Docker, built from the deck project root (see remote/compose.yaml):
# builds the single-file deck, then runs remote/server.mjs. Build arg BUILD_SCRIPT picks the npm script.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
ARG BUILD_SCRIPT=build:single
RUN npm run "$BUILD_SCRIPT" && mkdir -p media src/scenes dist-single dist

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/node_modules/ws node_modules/ws
COPY --from=build /app/dist-single dist-single
COPY --from=build /app/dist dist
COPY --from=build /app/src/scenes src/scenes
COPY --from=build /app/media media
COPY --from=build /app/remote remote
ENV HOST=0.0.0.0 PORT=8787 RECORDINGS_DIR=/app/recordings
EXPOSE 8787
CMD ["node", "remote/server.mjs"]
