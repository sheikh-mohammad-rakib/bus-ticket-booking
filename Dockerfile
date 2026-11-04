# Riders — bus ticket booking (Bangladesh)
# Single-service container: API + built React app, SQLite on disk.
FROM node:24-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm install --no-audit --no-fund \
 && npm --prefix server install --omit=dev --no-audit --no-fund \
 && npm --prefix client install --no-audit --no-fund

# Build the frontend
COPY server server
COPY client client
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000

# Mount a volume here (e.g. fly volumes) to persist the SQLite DB across deploys:
# docker run -v riders-data:/data -e DATA_DIR=/data ...
CMD ["node", "server/src/index.js"]
