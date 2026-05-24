# Stage 1: Build the Vite app
# Bumped from node:18 to node:20 to satisfy Vite's requirements
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
ARG VITE_API_URL=http://18.222.93.147:3000
ARG VITE_EVIDENCE_API_BASE_URL=/evidence-api
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_EVIDENCE_API_BASE_URL=$VITE_EVIDENCE_API_BASE_URL

RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:stable-alpine
LABEL app="hom-central-frontend"
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
