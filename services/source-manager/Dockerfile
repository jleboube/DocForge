FROM node:20-alpine
WORKDIR /app
COPY services/source-manager/package.json ./package.json
COPY services/source-manager/src ./src
CMD ["npm", "start"]
