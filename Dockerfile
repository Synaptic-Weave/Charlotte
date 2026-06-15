# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies required for build
RUN npm install

# Copy the rest of the source code
COPY . .

# Build TypeScript to dist/
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Remove prepare script to avoid husky error in production
RUN npm pkg delete scripts.prepare && npm install --omit=dev

# Copy the built code from the builder stage
COPY --from=builder /app/dist ./dist

# Set NODE_ENV to production
ENV NODE_ENV=production

# Expose the application port
EXPOSE 3000

# Run the backend
CMD ["npm", "start"]
