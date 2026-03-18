FROM node:22-alpine
RUN apk add --no-cache android-tools
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]