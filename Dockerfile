FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node server/package.json server/package.json
COPY --chown=node:node extension/package.json extension/package.json
RUN npm ci --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node server server
COPY --chown=node:node seed seed
COPY --chown=node:node sandbox sandbox
# The downloadable extension, built for this service's own URL.
ARG GUIDERAIL_SERVER_URL=https://guiderail-coach-q7tihot5sq-uc.a.run.app
ARG GUIDERAIL_BUILD_REVISION=release
COPY --chown=node:node extension extension
RUN apt-get update && apt-get install -y --no-install-recommends zip && rm -rf /var/lib/apt/lists/* \
 && GUIDERAIL_SERVER_URL=$GUIDERAIL_SERVER_URL GUIDERAIL_BUILD_REVISION=$GUIDERAIL_BUILD_REVISION npm run build -w extension \
 && mkdir download && cd extension/dist && zip -qr ../../download/guiderail-extension.zip . \
 && cd /app && rm -rf extension/dist && chown -R node:node download
RUN mkdir data && chown node:node data
USER node
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["npm", "start", "--workspace", "server"]
