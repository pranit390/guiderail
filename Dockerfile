FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY extension/package.json extension/package.json
RUN npm ci --no-audit --no-fund && npm cache clean --force
COPY server server
COPY seed seed
COPY sandbox sandbox
RUN mkdir data && chown node:node data
USER node
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["npm", "start", "--workspace", "server"]
