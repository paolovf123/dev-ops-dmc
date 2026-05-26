# Stage 1: builder — instala node_modules con npm ci (deterministico)
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Stage 2: runtime — copia node_modules ya instalados, sin cache de npm
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
