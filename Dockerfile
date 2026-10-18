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
RUN mkdir data && chown node:node data
USER node
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["npm", "start", "--workspace", "server"]
