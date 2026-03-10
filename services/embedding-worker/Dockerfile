FROM node:20-alpine
WORKDIR /app
COPY services/embedding-worker/package.json ./package.json
COPY services/embedding-worker/src ./src
CMD ["npm", "start"]
