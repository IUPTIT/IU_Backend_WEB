# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# node_modules at / (outside the /app bind-mount) so mounted source can't shadow it.
FROM node:20-alpine AS dev
ENV NODE_ENV=development
WORKDIR /
COPY package.json package-lock.json ./
RUN npm ci
WORKDIR /app
COPY . .
USER node
EXPOSE 3456
CMD ["npm", "run", "dev"]

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .
USER node
EXPOSE 3456
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3456)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
