FROM node:20-alpine
WORKDIR /app
COPY services/api/package.json ./package.json
RUN npm install --omit=dev
COPY services/api/src ./src
EXPOSE 8080
CMD ["npm", "start"]
