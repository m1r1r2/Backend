FROM node:18-bullseye

# Install build tools
RUN apt-get update && apt-get install -y build-essential python3

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy source code
COPY . .

# Set environment variable for Cloud Run
ENV PORT=8080
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
