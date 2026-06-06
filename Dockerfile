# Portable build — works on Railway, Fly.io, Koyeb, Render (Docker), etc.
# The container serves the API and the built client on $PORT (default 4000).
FROM node:24-slim

WORKDIR /app
COPY . .

# Installs root + server + client deps (via postinstall), then builds both.
RUN npm install && npm run build

ENV NODE_ENV=production
EXPOSE 4000
CMD ["npm", "start"]
