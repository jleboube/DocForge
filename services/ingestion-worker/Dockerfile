FROM node:20-alpine
WORKDIR /app
COPY services/ingestion-worker/package.json ./package.json
COPY services/ingestion-worker/src ./src
CMD ["npm", "start"]
