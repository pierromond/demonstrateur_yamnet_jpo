FROM node:20-alpine
WORKDIR /app
COPY server.js config.json ./
COPY public ./public
EXPOSE 4500
CMD ["node", "server.js"]
