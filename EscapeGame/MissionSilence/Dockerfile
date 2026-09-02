FROM node:20-alpine
WORKDIR /app
COPY server.js config.json ./
COPY public ./public
EXPOSE 3000
CMD ["node", "server.js"]
