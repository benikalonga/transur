FROM node:20-alpine
WORKDIR /app

# Dépendances d'abord pour cache Docker
COPY package*.json ./
RUN npm ci --only=production

COPY src ./src
RUN mkdir -p uploads/profiles

EXPOSE 5000
CMD ["node", "src/index.js"]
