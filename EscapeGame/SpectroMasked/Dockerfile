FROM node:20-alpine
WORKDIR /app
COPY server.js config.json ./
COPY public ./public
COPY audio ./audio
EXPOSE 4000
CMD ["node", "server.js"]
