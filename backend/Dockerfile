FROM node:20-alpine
WORKDIR /srv/api

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY src ./src
RUN mkdir -p uploads/avatars && chown -R node:node /srv/api
USER node

ENV NODE_ENV=production
EXPOSE 5000

# Apply schema changes, then boot the API
CMD ["sh", "-c", "node src/db/migrate.js && node src/server.js"]
