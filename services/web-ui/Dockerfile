FROM node:20-alpine
WORKDIR /app
COPY services/web-ui/package.json ./package.json
RUN npm install --omit=dev
COPY services/web-ui/src ./src
COPY browser-extension/docforge-clipper ./src/public/extension
EXPOSE 3000
CMD ["npm", "start"]
