# Etapa 1: Construcción (TypeScript -> JavaScript)
FROM node:20-alpine AS build
WORKDIR /app
# Limita la memoria del compilador para no saturar servidores pequeños
ENV NODE_OPTIONS=--max-old-space-size=512
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Etapa 2: Imagen de producción
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Solo dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev

# Código ya compilado
COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
