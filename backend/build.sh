#!/bin/bash
# Build script for Render deployment

echo "Building Stealth Vault Backend..."

# Install dependencies
pip install -r requirements.txt

# Create necessary directories
mkdir -p uploads/vault/photos
mkdir -p uploads/vault/videos
mkdir -p uploads/vault/documents
mkdir -p uploads/chat_media/images
mkdir -p uploads/chat_media/videos
mkdir -p uploads/chat_media/documents
mkdir -p uploads/chat_media/voice
mkdir -p uploads/chat_media/thumbnails
mkdir -p uploads/avatars

echo "Build complete!"

