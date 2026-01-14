"""
Gunicorn configuration for production deployment on Render
"""
import multiprocessing
import os

# Server socket
port = os.environ.get('PORT', '5000')
bind = f"0.0.0.0:{port}"
backlog = 2048

# Worker processes
# Use 2 workers for Render (free tier works best with 1-2 workers)
workers = int(os.environ.get('WORKERS', 2))
worker_class = 'eventlet'
worker_connections = 1000
timeout = 120  # Increased for file uploads
keepalive = 5

# Logging
accesslog = '-'  # Log to stdout
errorlog = '-'  # Log to stderr
loglevel = os.environ.get('LOG_LEVEL', 'info').lower()
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Process naming
proc_name = 'stealth_vault_backend'

# Server mechanics
daemon = False
pidfile = None
umask = 0
user = None
group = None
tmp_upload_dir = None

# Graceful timeout
graceful_timeout = 30

# Preload app for better performance
preload_app = False  # Set to False for eventlet

# SSL (if needed)
# keyfile = None
# certfile = None

