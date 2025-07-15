#!/bin/bash

# Marmarica TV - Verification Script
# This script verifies that the deployment is working correctly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RESULTS_FILE="$PROJECT_DIR/verification-results.txt"

# Initialize results file
echo "Marmarica TV Verification Results - $(date)" > "$RESULTS_FILE"
echo "================================================" >> "$RESULTS_FILE"

# Helper functions
log_success() {
    echo -e "${GREEN}✓${NC} $1"
    echo "✓ $1" >> "$RESULTS_FILE"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
    echo "✗ $1" >> "$RESULTS_FILE"
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
    echo "ℹ $1" >> "$RESULTS_FILE"
}

# Get server IP from environment
get_server_ip() {
    if [[ -f "$PROJECT_DIR/server/.env" ]]; then
        SERVER_IP=$(grep "API_URL" "$PROJECT_DIR/server/.env" | cut -d'=' -f2 | cut -d':' -f2 | tr -d '/')
        if [[ -z "$SERVER_IP" ]]; then
            SERVER_IP="localhost"
        fi
    else
        SERVER_IP="localhost"
    fi
    log_info "Testing server at: $SERVER_IP"
}

# Test 1: System Dependencies
test_system_dependencies() {
    echo -e "\n${YELLOW}=== Testing System Dependencies ===${NC}"
    
    # Node.js
    if command -v node &> /dev/null; then
        local node_version=$(node --version)
        log_success "Node.js installed: $node_version"
    else
        log_error "Node.js not installed"
        return 1
    fi
    
    # FFmpeg
    if command -v ffmpeg &> /dev/null; then
        local ffmpeg_version=$(ffmpeg -version 2>&1 | head -n1 | cut -d' ' -f3)
        log_success "FFmpeg installed: $ffmpeg_version"
    else
        log_error "FFmpeg not installed"
        return 1
    fi
    
    # PM2
    if command -v pm2 &> /dev/null; then
        local pm2_version=$(pm2 --version)
        log_success "PM2 installed: $pm2_version"
    else
        log_error "PM2 not installed"
        return 1
    fi
    
    # SQLite3
    if command -v sqlite3 &> /dev/null; then
        log_success "SQLite3 installed"
    else
        log_error "SQLite3 not installed"
        return 1
    fi
}

# Test 2: Project Structure
test_project_structure() {
    echo -e "\n${YELLOW}=== Testing Project Structure ===${NC}"
    
    # Check main directories
    local required_dirs=("server" "client" "scripts")
    for dir in "${required_dirs[@]}"; do
        if [[ -d "$PROJECT_DIR/$dir" ]]; then
            log_success "Directory exists: $dir"
        else
            log_error "Directory missing: $dir"
            return 1
        fi
    done
    
    # Check key files
    local required_files=("server/index.js" "client/package.json" "ecosystem.config.js")
    for file in "${required_files[@]}"; do
        if [[ -f "$PROJECT_DIR/$file" ]]; then
            log_success "File exists: $file"
        else
            log_error "File missing: $file"
            return 1
        fi
    done
    
    # Check frontend build
    if [[ -d "$PROJECT_DIR/client/build" ]]; then
        log_success "Frontend build directory exists"
        if [[ -f "$PROJECT_DIR/client/build/index.html" ]]; then
            log_success "Frontend build files exist"
        else
            log_error "Frontend build files missing"
            return 1
        fi
    else
        log_error "Frontend build directory missing"
        return 1
    fi
}

# Test 3: Environment Configuration
test_environment_config() {
    echo -e "\n${YELLOW}=== Testing Environment Configuration ===${NC}"
    
    # Server .env
    if [[ -f "$PROJECT_DIR/server/.env" ]]; then
        log_success "Server .env file exists"
        
        # Check required variables
        local required_vars=("NODE_ENV" "PORT" "SESSION_SECRET" "API_URL")
        for var in "${required_vars[@]}"; do
            if grep -q "^$var=" "$PROJECT_DIR/server/.env"; then
                log_success "Server env variable set: $var"
            else
                log_error "Server env variable missing: $var"
                return 1
            fi
        done
    else
        log_error "Server .env file missing"
        return 1
    fi
    
    # Client .env
    if [[ -f "$PROJECT_DIR/client/.env" ]]; then
        log_success "Client .env file exists"
        
        # Check required variables
        local required_vars=("REACT_APP_API_URL" "REACT_APP_UPLOADS_URL")
        for var in "${required_vars[@]}"; do
            if grep -q "^$var=" "$PROJECT_DIR/client/.env"; then
                log_success "Client env variable set: $var"
            else
                log_error "Client env variable missing: $var"
                return 1
            fi
        done
    else
        log_error "Client .env file missing"
        return 1
    fi
}

# Test 4: Database
test_database() {
    echo -e "\n${YELLOW}=== Testing Database ===${NC}"
    
    local db_path="$PROJECT_DIR/server/database.sqlite"
    
    if [[ -f "$db_path" ]]; then
        log_success "Database file exists"
        
        # Check database integrity
        if sqlite3 "$db_path" "PRAGMA integrity_check;" | grep -q "ok"; then
            log_success "Database integrity check passed"
        else
            log_error "Database integrity check failed"
            return 1
        fi
        
        # Check required tables
        local required_tables=("devices" "channels" "news" "actions" "admins")
        for table in "${required_tables[@]}"; do
            if sqlite3 "$db_path" "SELECT name FROM sqlite_master WHERE type='table' AND name='$table';" | grep -q "$table"; then
                log_success "Database table exists: $table"
            else
                log_error "Database table missing: $table"
                return 1
            fi
        done
        
        # Check table counts
        local table_count=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';")
        log_info "Total database tables: $table_count"
        
        # Check for admin user
        local admin_count=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM admins WHERE username='admin';" 2>/dev/null || echo "0")
        if [[ $admin_count -gt 0 ]]; then
            log_success "Admin user exists in database"
        else
            log_error "Admin user missing from database"
            return 1
        fi
    else
        log_error "Database file missing: $db_path"
        return 1
    fi
}

# Test 5: PM2 Services
test_pm2_services() {
    echo -e "\n${YELLOW}=== Testing PM2 Services ===${NC}"
    
    # Check if PM2 is running
    if pm2 ping &> /dev/null; then
        log_success "PM2 daemon is running"
    else
        log_error "PM2 daemon not running"
        return 1
    fi
    
    # Check marmarica-tv-server process
    local server_status=$(pm2 jlist | jq -r '.[] | select(.name=="marmarica-tv-server") | .pm2_env.status' 2>/dev/null || echo "not_found")
    if [[ "$server_status" == "online" ]]; then
        log_success "marmarica-tv-server is online"
    else
        log_error "marmarica-tv-server is not online (status: $server_status)"
        return 1
    fi
    
    # Check that old client process is not running
    local client_status=$(pm2 jlist | jq -r '.[] | select(.name=="marmarica-tv-client") | .pm2_env.status' 2>/dev/null || echo "not_found")
    if [[ "$client_status" == "not_found" ]]; then
        log_success "marmarica-tv-client process correctly removed"
    else
        log_error "marmarica-tv-client process still running (should be removed)"
        return 1
    fi
    
    # Check process uptime
    local uptime=$(pm2 jlist | jq -r '.[] | select(.name=="marmarica-tv-server") | .pm2_env.pm_uptime' 2>/dev/null || echo "0")
    if [[ $uptime -gt 0 ]]; then
        local uptime_formatted=$(date -d @$((uptime/1000)) -u +%H:%M:%S)
        log_success "Server uptime: $uptime_formatted"
    fi
}

# Test 6: API Endpoints
test_api_endpoints() {
    echo -e "\n${YELLOW}=== Testing API Endpoints ===${NC}"
    
    # Health endpoint
    local health_response=$(curl -s "http://$SERVER_IP:5000/api/health" 2>/dev/null || echo "failed")
    if [[ "$health_response" == *"OK"* ]]; then
        log_success "Health endpoint working"
    else
        log_error "Health endpoint failed: $health_response"
        return 1
    fi
    
    # Test API endpoints that should return 401 (unauthorized)
    local endpoints=("channels" "devices" "news" "dashboard")
    for endpoint in "${endpoints[@]}"; do
        local response_code=$(curl -s -o /dev/null -w "%{http_code}" "http://$SERVER_IP:5000/api/$endpoint" 2>/dev/null || echo "000")
        if [[ "$response_code" == "401" ]]; then
            log_success "API endpoint protected: $endpoint (returned 401)"
        else
            log_error "API endpoint not properly protected: $endpoint (returned $response_code)"
            return 1
        fi
    done
    
    # Test public client endpoints
    local client_response=$(curl -s -o /dev/null -w "%{http_code}" "http://$SERVER_IP:5000/api/client/check-device" -X POST -H "Content-Type: application/json" -d '{"duid":"TEST123"}' 2>/dev/null || echo "000")
    if [[ "$client_response" == "404" ]]; then
        log_success "Client API endpoint working (returned 404 for non-existent device)"
    else
        log_error "Client API endpoint failed (returned $client_response)"
        return 1
    fi
}

# Test 7: Frontend Access
test_frontend_access() {
    echo -e "\n${YELLOW}=== Testing Frontend Access ===${NC}"
    
    # Test root endpoint
    local root_response=$(curl -s -o /dev/null -w "%{http_code}" "http://$SERVER_IP:5000/" 2>/dev/null || echo "000")
    if [[ "$root_response" == "200" ]]; then
        log_success "Frontend root accessible (returned 200)"
    else
        log_error "Frontend root not accessible (returned $root_response)"
        return 1
    fi
    
    # Test that it returns HTML
    local content_type=$(curl -s -I "http://$SERVER_IP:5000/" 2>/dev/null | grep -i "content-type" | cut -d' ' -f2 || echo "unknown")
    if [[ "$content_type" == *"text/html"* ]]; then
        log_success "Frontend serves HTML content"
    else
        log_error "Frontend not serving HTML (content-type: $content_type)"
        return 1
    fi
    
    # Test frontend routes
    local routes=("login" "dashboard" "channels")
    for route in "${routes[@]}"; do
        local route_response=$(curl -s -o /dev/null -w "%{http_code}" "http://$SERVER_IP:5000/$route" 2>/dev/null || echo "000")
        if [[ "$route_response" == "200" ]]; then
            log_success "Frontend route accessible: /$route"
        else
            log_error "Frontend route not accessible: /$route (returned $route_response)"
            return 1
        fi
    done
}

# Test 8: Static Files
test_static_files() {
    echo -e "\n${YELLOW}=== Testing Static Files ===${NC}"
    
    # Test uploads directory
    local uploads_response=$(curl -s -o /dev/null -w "%{http_code}" "http://$SERVER_IP:5000/uploads/" 2>/dev/null || echo "000")
    if [[ "$uploads_response" == "200" || "$uploads_response" == "403" ]]; then
        log_success "Uploads directory accessible"
    else
        log_error "Uploads directory not accessible (returned $uploads_response)"
        return 1
    fi
    
    # Test HLS directory
    local hls_response=$(curl -s -o /dev/null -w "%{http_code}" "http://$SERVER_IP:5000/hls_stream/" 2>/dev/null || echo "000")
    if [[ "$hls_response" == "200" || "$hls_response" == "403" ]]; then
        log_success "HLS directory accessible"
    else
        log_error "HLS directory not accessible (returned $hls_response)"
        return 1
    fi
}

# Test 9: File Permissions
test_file_permissions() {
    echo -e "\n${YELLOW}=== Testing File Permissions ===${NC}"
    
    # Test uploads directory
    if [[ -d "$PROJECT_DIR/server/uploads" ]]; then
        if [[ -w "$PROJECT_DIR/server/uploads" ]]; then
            log_success "Uploads directory is writable"
        else
            log_error "Uploads directory is not writable"
            return 1
        fi
    else
        log_error "Uploads directory does not exist"
        return 1
    fi
    
    # Test HLS directory
    if [[ -d "/var/www/html/hls_stream" ]]; then
        if [[ -w "/var/www/html/hls_stream" ]]; then
            log_success "HLS directory is writable"
        else
            log_error "HLS directory is not writable"
            return 1
        fi
    else
        log_error "HLS directory does not exist"
        return 1
    fi
    
    # Test database file
    if [[ -w "$PROJECT_DIR/server/database.sqlite" ]]; then
        log_success "Database file is writable"
    else
        log_error "Database file is not writable"
        return 1
    fi
}

# Test 10: Transcoding System
test_transcoding_system() {
    echo -e "\n${YELLOW}=== Testing Transcoding System ===${NC}"
    
    # Test FFmpeg access
    if command -v ffmpeg &> /dev/null; then
        log_success "FFmpeg is accessible"
    else
        log_error "FFmpeg is not accessible"
        return 1
    fi
    
    # Test transcoding API endpoint
    local transcoding_response=$(curl -s -o /dev/null -w "%{http_code}" "http://$SERVER_IP:5000/api/transcoding/stats" 2>/dev/null || echo "000")
    if [[ "$transcoding_response" == "401" ]]; then
        log_success "Transcoding API endpoint exists (returned 401)"
    else
        log_error "Transcoding API endpoint failed (returned $transcoding_response)"
        return 1
    fi
}

# Main verification function
main() {
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                      MARMARICA TV VERIFICATION SCRIPT                        ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo
    
    get_server_ip
    
    local failed_tests=0
    
    # Run all tests
    test_system_dependencies || ((failed_tests++))
    test_project_structure || ((failed_tests++))
    test_environment_config || ((failed_tests++))
    test_database || ((failed_tests++))
    test_pm2_services || ((failed_tests++))
    test_api_endpoints || ((failed_tests++))
    test_frontend_access || ((failed_tests++))
    test_static_files || ((failed_tests++))
    test_file_permissions || ((failed_tests++))
    test_transcoding_system || ((failed_tests++))
    
    # Summary
    echo -e "\n${YELLOW}=== Verification Summary ===${NC}"
    echo "Total tests: 10"
    echo "Failed tests: $failed_tests"
    echo "Results saved to: $RESULTS_FILE"
    
    if [[ $failed_tests -eq 0 ]]; then
        echo -e "\n${GREEN}✅ All verification tests passed!${NC}"
        echo -e "${GREEN}Your Marmarica TV deployment is working correctly.${NC}"
        echo
        echo -e "${YELLOW}Access your application at:${NC}"
        echo "  Frontend: http://$SERVER_IP:5000"
        echo "  Admin:    http://$SERVER_IP:5000/login"
        echo "  API:      http://$SERVER_IP:5000/api/health"
        echo
        exit 0
    else
        echo -e "\n${RED}❌ $failed_tests verification tests failed!${NC}"
        echo -e "${RED}Please check the errors above and fix them before using the application.${NC}"
        echo
        exit 1
    fi
}

# Run main function
main "$@"
