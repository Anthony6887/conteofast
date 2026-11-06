
# ==========================================
# CONTEOFAST - BACKEND NODE.JS
# ==========================================

FROM node:24-bookworm-slim

# Directorio de trabajo
WORKDIR /app

# Configuracion de produccion
ENV NODE_ENV=production
ENV PORT=5002
ENV TZ=America/Guayaquil

# Copiar dependencias
COPY package.json package-lock.json ./

# Instalar solo dependencias de produccion
RUN npm ci --omit=dev \
  && npm cache clean --force

# Copiar el proyecto
COPY --chown=node:node . .

# Ejecutar con usuario sin privilegios
USER node

# Puerto de Express
EXPOSE 5002

# Iniciar API
CMD ["node", "index.js"]
