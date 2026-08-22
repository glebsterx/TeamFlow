# Pinned by digest, not just tag: this host's network to Docker Hub's auth/
# registry endpoints is unreliable (repeated DNS/TLS-handshake failures) —
# pinning avoids a fresh `docker build` needing metadata resolution when the
# layer is already cached locally. Same python:3.11-slim, bump the digest
# when you actually want to update the base image.
FROM python:3.11-slim@sha256:9c900dea9e8fb7e16277c179b555cc72d29a352dbc33cff48ad5a0412fd5bfc7

WORKDIR /app

# Install system dependencies (curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create directory for SQLite database
RUN mkdir -p /app/data

# Expose port for web API
EXPOSE 8000

# Run application (both bot and API)
CMD ["python", "-m", "app.main"]
