FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG APP_RELEASE=development
ENV APP_RELEASE=$APP_RELEASE
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
RUN node scripts/stamp-release.mjs

FROM build AS notifications
RUN npm prune --omit=dev
USER node
CMD ["node","--import","tsx","scripts/notifications.ts"]

FROM node:24-alpine AS app
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/scripts/setup.mjs ./scripts/setup.mjs
COPY --from=build --chown=node:node /app/scripts/runtime-roles.mjs ./scripts/runtime-roles.mjs
COPY --from=build --chown=node:node /app/db ./db
USER node
EXPOSE 3000
CMD ["node","server.js"]
