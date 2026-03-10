FROM node:20-alpine
WORKDIR /app
COPY services/scheduler/package.json ./package.json
COPY services/scheduler/src ./src
CMD ["npm", "start"]
