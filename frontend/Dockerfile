# Pinned by digest — see backend/Dockerfile for why.
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293

WORKDIR /app

# Копируем package files
COPY package*.json ./
RUN npm install

# Копируем .env ПЕРЕД сборкой
COPY .env* ./

# Копируем остальное
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
