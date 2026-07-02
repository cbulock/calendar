# Stage 1: Build the Vue app
FROM node:lts-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Final image — nginx (static files) + Node.js (API server)
FROM node:lts-alpine

# Install nginx, supervisord, openssl, and Chromium for server-side rendering.
RUN apk add --no-cache nginx supervisor openssl chromium

ENV CALENDAR_RENDER_BROWSER_PATH=/usr/bin/chromium-browser
ENV CALENDAR_RENDER_BASE_URL=http://127.0.0.1

# --- Frontend ---
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/http.d/default.conf
# Placeholder auth config included by nginx.conf — replaced at runtime by entrypoint.sh
RUN touch /etc/nginx/auth.conf

# --- API Server ---
WORKDIR /app/server
COPY package*.json /app/
RUN cd /app && npm ci --omit=dev
COPY server/ .
# Copy src so the server can import shared modules (e.g. src/plugins/utils/icsParser.js)
COPY src/ /app/src/
COPY --from=build /app/dist /app/dist

# supervisord config to run nginx + node together
COPY supervisord.conf /etc/supervisord.conf

# Entrypoint — sets up optional HTTP Basic Auth then starts supervisord
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Declare /data as a persistent volume for application data
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
