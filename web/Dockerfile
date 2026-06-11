# Portable build for the website (pocketaitrades.com) — Railway, Fly.io, Koyeb,
# Render (Docker), etc. Serves the API and the built client on $PORT (default 4001).
FROM node:24-slim

WORKDIR /app
COPY . .

# Installs root + server + client deps (via postinstall), then builds both.
RUN npm install && npm run build

ENV NODE_ENV=production
EXPOSE 4001
CMD ["npm", "start"]
