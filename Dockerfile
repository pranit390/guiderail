FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node server/package.json server/package.json
COPY --chown=node:node extension/package.json extension/package.json
RUN npm ci --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node server server
COPY --chown=node:node shared shared
COPY --chown=node:node seed seed
COPY --chown=node:node sandbox sandbox
# Package the extension for this coach's origin, with manifest.json at the ZIP root.
ARG GUIDERAIL_SERVER_URL=https://guiderail-coach-q7tihot5sq-uc.a.run.app
ARG GUIDERAIL_BUILD_REVISION=release
# The Firebase web API key for the extension's sign-in form. Passed at build time, never committed;
# without it the packaged extension has no sign-in and the hosted coach refuses it.
ARG GUIDERAIL_FIREBASE_API_KEY=
COPY --chown=node:node extension extension
RUN apt-get update && apt-get install -y --no-install-recommends zip && rm -rf /var/lib/apt/lists/* \
 && GUIDERAIL_SERVER_URL="$GUIDERAIL_SERVER_URL" GUIDERAIL_BUILD_REVISION="$GUIDERAIL_BUILD_REVISION" GUIDERAIL_FIREBASE_API_KEY="$GUIDERAIL_FIREBASE_API_KEY" npm run build:ext \
 && mkdir download && cd extension/dist && zip -qr ../../download/guiderail-extension.zip . \
 && cd /app && rm -rf extension/dist && chown -R node:node download
RUN mkdir data && chown node:node data
USER node
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["npm", "start", "--workspace", "server"]
