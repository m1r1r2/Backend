# Use official Node.js LTS Alpine image
FROM node:18-alpine

# Install build tools for native modules
RUN apk add --no-cache make gcc g++ python3

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first for caching
COPY package*.json ./

# Install dependencies (swisseph-v2 will build for Linux here)
RUN npm install --production

# Copy rest of the app code
COPY . .

# Expose port Cloud Run expects
ENV PORT=8080
EXPOSE 8080

# Start the app
CMD ["npm", "start"]
