# Use Ubuntu 22.04 base
FROM ubuntu:22.04

# Install Node.js 18, build tools, and required libraries
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    python3 \
    libc6 \
    libstdc++6 \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependencies and install
COPY package*.json ./
RUN npm install --production

# Copy source code
COPY . .

# Cloud Run expects PORT env variable
ENV PORT=8080
EXPOSE 8080

# Start the server
CMD ["node", "index.js"]
