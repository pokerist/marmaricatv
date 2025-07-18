#!/bin/bash

# Marmarica TV - Automated Deployment Script
# This script automates the complete deployment process

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
LOG_FILE="$SCRIPT_DIR/deployment.log"
BACKUP_DIR="$SCRIPT_DIR/deployment-backup"
DEFAULT_SESSION_SECRET="Qw73o9Gx#h!sZm42nXvtp8bLaT@E0RuQj"

# Logging function
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] INFO:${NC} $1" | tee -a "$LOG_FILE"
}

# Banner
print_banner() {
    echo -e "${GREEN}"
    echo "╔═══════════════════════════════════════════════════════════════════════════════╗"
    echo "║                        MARMARICA TV DEPLOYMENT SCRIPT                        ║"
    echo "║                     Automated Production Deployment                          ║"
    echo "╚═══════════════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        error "This script should not be run as root. Please run as a regular user."
        exit 1
    fi
}

# Get server IP
get_server_ip() {
    # Try to auto-detect IP
    local ip=$(hostname -I | awk '{print $1}')
    if [[ -z "$ip" ]]; then
        ip=$(ip route get 1 2>/dev/null | grep -oP 'src \K\S+' || echo "127.0.0.1")
    fi
    
    echo
    info "Auto-detected server IP: $ip"
    read -p "Is this correct? (y/n) [y]: " confirm
    confirm=${confirm:-y}
    
    if [[ "$confirm" != "y" ]]; then
        read -p "Please enter the server IP address: " ip
    fi
    
    SERVER_IP="$ip"
    log "Using server IP: $SERVER_IP"
}

# System requirements check
check_requirements() {
    log "Checking system requirements..."
    
    # Check OS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        log "✓ Linux detected"
    else
        error "This script requires Linux. Detected: $OSTYPE"
        exit 1
    fi
    
    # Check available space
    local available_space=$(df / | tail -1 | awk '{print $4}')
    local required_space=5242880  # 5GB in KB
    
    if [[ $available_space -lt $required_space ]]; then
        error "Insufficient disk space. Required: 5GB, Available: $((available_space/1024/1024))GB"
        exit 1
    fi
    
    log "✓ System requirements met"
}

# Install system dependencies
install_dependencies() {
    log "Installing system dependencies..."
    
    # Update package list
    sudo apt update -y
    
    # Install Node.js 18+
    if ! command -v node &> /dev/null; then
        log "Installing Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    
    # Verify Node.js version
    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ $node_version -lt 18 ]]; then
        error "Node.js 18+ required. Current version: $(node --version)"
        exit 1
    fi
    log "✓ Node.js $(node --version) installed"
    
    # Install FFmpeg
    if ! command -v ffmpeg &> /dev/null; then
        log "Installing FFmpeg..."
        sudo apt install -y ffmpeg
    fi
    log "✓ FFmpeg $(ffmpeg -version 2>&1 | head -n1 | cut -d' ' -f3) installed"
    
    # Install PM2
    if ! command -v pm2 &> /dev/null; then
        log "Installing PM2..."
        npm install -g pm2
    fi
    log "✓ PM2 $(pm2 --version) installed"
    
    # Install SQLite3
    if ! command -v sqlite3 &> /dev/null; then
        log "Installing SQLite3..."
        sudo apt install -y sqlite3
    fi
    log "✓ SQLite3 installed"
    
    # Install additional tools
    sudo apt install -y curl wget git htop
    log "✓ Additional tools installed"
}

# Install project dependencies
install_project_dependencies() {
    log "Installing project dependencies..."
    
    # Install backend dependencies
    cd "$SCRIPT_DIR/server"
    log "Installing backend dependencies..."
    npm install
    log "✓ Backend dependencies installed"
    
    # Install frontend dependencies
    cd "$SCRIPT_DIR/client"
    log "Installing frontend dependencies..."
    npm install
    log "✓ Frontend dependencies installed"
    
    cd "$SCRIPT_DIR"
}

# Create environment files
create_environment_files() {
    log "Creating environment files..."
    
    # Create server .env
    cat > "$SCRIPT_DIR/server/.env" << EOF
# Server Configuration
NODE_ENV=production
PORT=5000
SESSION_SECRET=$DEFAULT_SESSION_SECRET

# Database
DATABASE_PATH=./database.sqlite

# CORS and API URLs
CORS_ORIGIN=http://$SERVER_IP:5000
API_URL=http://$SERVER_IP:5000
SERVER_BASE_URL=http://$SERVER_IP:5000

# File Upload
UPLOAD_DIR=uploads
MAX_FILE_SIZE=5242880

# Transcoding Configuration
FFMPEG_PATH=ffmpeg
HLS_OUTPUT_BASE=/var/www/html/hls_stream
CLEANUP_INTERVAL=300000
MAX_SEGMENT_AGE=30000
MAX_CHANNEL_DIR_SIZE=104857600
HLS_LIST_SIZE=3
ORPHANED_DIR_CLEANUP_AGE=3600000
EOF
    
    # Create client .env
    cat > "$SCRIPT_DIR/client/.env" << EOF
# API Configuration
REACT_APP_API_URL=http://$SERVER_IP:5000/api
REACT_APP_API_TIMEOUT=8000
REACT_APP_API_RETRIES=2

# Upload Configuration
REACT_APP_UPLOADS_URL=http://$SERVER_IP:5000/uploads
REACT_APP_MAX_UPLOAD_SIZE=5242880

# Note: Frontend is now served from the same port as the backend (5000)
# Access the frontend at: http://$SERVER_IP:5000
EOF
    
    log "✓ Environment files created"
}

# Setup directories
setup_directories() {
    log "Setting up directories..."
    
    # Create HLS output directory
    sudo mkdir -p /var/www/html/hls_stream
    sudo chown -R $USER:$USER /var/www/html/hls_stream
    sudo chmod -R 755 /var/www/html/hls_stream
    log "✓ HLS directory created: /var/www/html/hls_stream"
    
    # Create uploads directory
    mkdir -p "$SCRIPT_DIR/server/uploads"
    chmod 755 "$SCRIPT_DIR/server/uploads"
    log "✓ Uploads directory created"
    
    # Create logs directory
    mkdir -p "$SCRIPT_DIR/logs"
    chmod 755 "$SCRIPT_DIR/logs"
    log "✓ Logs directory created"
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    log "✓ Backup directory created"
}

# Initialize database
initialize_database() {
    log "Initializing database..."
    
    cd "$SCRIPT_DIR/server"
    
    # Run database initialization script
    if [[ -f "scripts/initialize-database.js" ]]; then
        node scripts/initialize-database.js
        log "✓ Database initialized"
    else
        error "Database initialization script not found"
        exit 1
    fi
    
    cd "$SCRIPT_DIR"
}

# Create admin user
create_admin_user() {
    log "Creating admin user..."
    
    cd "$SCRIPT_DIR/server"
    
    # Create admin user with default password
    if [[ -f "scripts/manage-admin.js" ]]; then
        node scripts/manage-admin.js create admin
        log "✓ Admin user created"
        
        # Show admin credentials
        if [[ -f "admin-credentials.txt" ]]; then
            info "Admin credentials:"
            cat admin-credentials.txt
        fi
    else
        error "Admin management script not found"
        exit 1
    fi
    
    cd "$SCRIPT_DIR"
}

# Build frontend
build_frontend() {
    log "Building frontend..."
    
    cd "$SCRIPT_DIR/client"
    
    # Build React app
    npm run build
    log "✓ Frontend built successfully"
    
    # Verify build directory
    if [[ -d "build" ]]; then
        local build_size=$(du -sh build | cut -f1)
        log "✓ Build directory created (size: $build_size)"
    else
        error "Frontend build failed - no build directory found"
        exit 1
    fi
    
    cd "$SCRIPT_DIR"
}

# Start services
start_services() {
    log "Starting services..."
    
    # Stop any existing processes
    pm2 delete marmarica-tv-server 2>/dev/null || true
    pm2 delete marmarica-tv-client 2>/dev/null || true
    
    # Start with PM2
    pm2 start ecosystem.config.js
    
    # Save PM2 configuration
    pm2 save
    
    # Setup PM2 startup
    pm2 startup systemd -u $USER --hp $HOME
    
    log "✓ Services started with PM2"
}

# Run verification tests
run_verification() {
    log "Running verification tests..."
    
    # Wait for services to start
    sleep 5
    
    # Test health endpoint
    local health_response=$(curl -s "http://localhost:5000/api/health" || echo "failed")
    if [[ "$health_response" == *"OK"* ]]; then
        log "✓ Health endpoint working"
    else
        error "Health endpoint failed: $health_response"
        return 1
    fi
    
    # Test PM2 status
    local pm2_status=$(pm2 jlist | jq -r '.[] | select(.name=="marmarica-tv-server") | .pm2_env.status')
    if [[ "$pm2_status" == "online" ]]; then
        log "✓ PM2 service online"
    else
        error "PM2 service not online: $pm2_status"
        return 1
    fi
    
    # Test database
    cd "$SCRIPT_DIR/server"
    local db_tables=$(sqlite3 database.sqlite "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "0")
    if [[ $db_tables -gt 5 ]]; then
        log "✓ Database tables created ($db_tables tables)"
    else
        error "Database verification failed"
        return 1
    fi
    
    # Test frontend build
    if [[ -f "client/build/index.html" ]]; then
        log "✓ Frontend build exists"
    else
        error "Frontend build not found"
        return 1
    fi
    
    cd "$SCRIPT_DIR"
    log "✓ All verification tests passed"
}

# Create backup
create_backup() {
    log "Creating deployment backup..."
    
    local backup_file="$BACKUP_DIR/pre-deployment-$(date +%Y%m%d_%H%M%S).tar.gz"
    
    # Backup existing files
    tar -czf "$backup_file" \
        --exclude='node_modules' \
        --exclude='build' \
        --exclude='logs' \
        --exclude='*.log' \
        . 2>/dev/null || true
    
    log "✓ Backup created: $backup_file"
}

# Print deployment summary
print_summary() {
    echo
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                          DEPLOYMENT COMPLETED                                ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo
    echo -e "${BLUE}🎉 Marmarica TV has been successfully deployed!${NC}"
    echo
    echo -e "${YELLOW}Access Information:${NC}"
    echo "  Frontend URL: http://$SERVER_IP:5000"
    echo "  Admin Panel:  http://$SERVER_IP:5000/login"
    echo "  API Health:   http://$SERVER_IP:5000/api/health"
    echo
    echo -e "${YELLOW}Admin Credentials:${NC}"
    if [[ -f "server/admin-credentials.txt" ]]; then
        cat server/admin-credentials.txt
    fi
    echo
    echo -e "${YELLOW}Service Management:${NC}"
    echo "  Status:   pm2 status"
    echo "  Logs:     pm2 logs marmarica-tv-server"
    echo "  Restart:  pm2 restart marmarica-tv-server"
    echo "  Stop:     pm2 stop marmarica-tv-server"
    echo
    echo -e "${YELLOW}Files & Directories:${NC}"
    echo "  Database: $SCRIPT_DIR/server/database.sqlite"
    echo "  Uploads:  $SCRIPT_DIR/server/uploads/"
    echo "  HLS:      /var/www/html/hls_stream/"
    echo "  Logs:     $SCRIPT_DIR/logs/"
    echo "  Backups:  $BACKUP_DIR/"
    echo
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "  1. Access the admin panel using the credentials above"
    echo "  2. Configure your channels and devices"
    echo "  3. Set up transcoding profiles if needed"
    echo "  4. Configure automatic backups"
    echo
    echo -e "${GREEN}Deployment log saved to: $LOG_FILE${NC}"
    echo
}

# Cleanup on failure
cleanup_on_failure() {
    error "Deployment failed. Cleaning up..."
    
    # Stop PM2 processes
    pm2 delete marmarica-tv-server 2>/dev/null || true
    pm2 delete marmarica-tv-client 2>/dev/null || true
    
    # Remove created files
    rm -f "$SCRIPT_DIR/server/.env" 2>/dev/null || true
    rm -f "$SCRIPT_DIR/client/.env" 2>/dev/null || true
    
    echo "Cleanup completed. Check the log file for details: $LOG_FILE"
    exit 1
}

# Main deployment function
main() {
    # Initialize log file
    echo "Marmarica TV Deployment Started at $(date)" > "$LOG_FILE"
    
    # Set up error handling
    trap cleanup_on_failure ERR
    
    print_banner
    
    # Interactive setup
    get_server_ip
    
    log "Starting deployment process..."
    
    # Run deployment steps
    check_root
    check_requirements
    create_backup
    install_dependencies
    setup_directories
    create_environment_files
    install_project_dependencies
    initialize_database
    create_admin_user
    build_frontend
    start_services
    run_verification
    
    # Success
    print_summary
    log "Deployment completed successfully!"
}

# Run main function
main "$@"