# Stage 1: Build the Vue app
FROM node:lts-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Final image — nginx (static files) + Node.js (API server)
FROM node:lts-alpine

# Install nginx and supervisord to manage both processes
RUN apk add --no-cache nginx supervisor

# --- Frontend ---
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/http.d/default.conf

# --- API Server ---
WORKDIR /app/server
COPY package*.json /app/
RUN cd /app && npm ci --omit=dev
COPY server/ .

# supervisord config to run nginx + node together
COPY supervisord.conf /etc/supervisord.conf

# Declare /data as a persistent volume for application data
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 80

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
