FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y postgresql-client openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

RUN npm run build

EXPOSE 8080

CMD ["npm", "start"]
