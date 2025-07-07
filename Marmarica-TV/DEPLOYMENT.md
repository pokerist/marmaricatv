# Marmarica TV Deployment Guide

This guide provides simplified instructions for deploying the Marmarica TV IPTV Admin Panel on an Ubuntu server.

## Prerequisites

- Ubuntu Server 20.04 LTS or higher
- Node.js 16.x or higher
- npm 8.x or higher
- PM2 (Process Manager)
- Git

## Server Setup

1. **Update System Packages**
   ```bash
   sudo apt update
   sudo apt upgrade -y
   ```

2. **Install Node.js and npm**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Install PM2 Globally**
   ```bash
   sudo npm install -g pm2
   ```

## Application Deployment

1. **Create Application Directory**
   ```bash
   sudo mkdir -p /var/www
   sudo chown -R $USER:$USER /var/www
   ```

2. **Clone Repository**
   ```bash
   cd /var/www
   git clone https://github.com/pokerist/marmaricatv.git
   cd marmaricatv
   ```

3. **Install Dependencies and Build**

   a. Server Setup:
   ```bash
   cd server
   npm install --production
   ```

   b. Client Setup:
   ```bash
   cd ../client
   npm install
   npm run build
   ```

4. **Database Setup**

   a. Initialize Database:
   ```bash
   cd ../server
   node scripts/setup-admin.js
   # Follow prompts to create admin account
   ```

   b. Update Channel Order Support:
   ```bash
   node scripts/update-channels-order.js
   ```

5. **Start Application with PM2**
   ```bash
   pm2 start index.js --name marmarica-tv
   pm2 save
   pm2 startup
   ```

## File Permissions

1. **Set Upload Directory Permissions**
   ```bash
   sudo chown -R $USER:$USER /var/www/marmaricatv/server/uploads
   sudo chmod -R 755 /var/www/marmaricatv/server/uploads
   ```

## Backup Setup

1. **Create Backup Directory**
   ```bash
   sudo mkdir -p /var/backups/marmarica-tv
   sudo chown -R $USER:$USER /var/backups/marmarica-tv
   ```

2. **Create Backup Script**
   ```bash
   sudo nano /usr/local/bin/backup-marmarica-tv.sh
   ```

   Add script content:
   ```bash
   #!/bin/bash
   
   BACKUP_DIR="/var/backups/marmarica-tv"
   APP_DIR="/var/www/marmaricatv"
   DATE=$(date +%Y%m%d_%H%M%S)
   
   # Backup database
   cp $APP_DIR/server/database.sqlite $BACKUP_DIR/database_$DATE.sqlite
   
   # Backup uploads
   tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz $APP_DIR/server/uploads
   
   # Keep only last 30 days of backups
   find $BACKUP_DIR -type f -mtime +30 -delete
   ```

   Make script executable:
   ```bash
   sudo chmod +x /usr/local/bin/backup-marmarica-tv.sh
   ```

3. **Setup Daily Backups**
   ```bash
   (crontab -l 2>/dev/null; echo "0 0 * * * /usr/local/bin/backup-marmarica-tv.sh") | crontab -
   ```

## Monitoring

1. **PM2 Monitoring**
   ```bash
   pm2 monit
   ```

2. **Log Files**
   - Application Logs: `~/.pm2/logs/`
   - Server Logs: `/var/www/marmaricatv/server/logs/`

## Maintenance

1. **Update Application**
   ```bash
   cd /var/www/marmaricatv
   git pull
   
   # Update server
   cd server
   npm install --production
   
   # Update client
   cd ../client
   npm install
   npm run build
   
   # Restart application
   pm2 restart marmarica-tv
   ```

2. **Database Maintenance**
   ```bash
   cd /var/www/marmaricatv/server
   sqlite3 database.sqlite "VACUUM;"
   ```

## Troubleshooting

1. **Check Application Status**
   ```bash
   pm2 status
   pm2 logs marmarica-tv
   ```

2. **Common Issues**

   a. Permission Issues:
   ```bash
   sudo chown -R $USER:$USER /var/www/marmaricatv
   sudo chmod -R 755 /var/www/marmaricatv
   ```

   b. Port Issues:
   ```bash
   # Check if port 80 is in use
   sudo netstat -tulpn | grep :80
   ```

   c. Process Issues:
   ```bash
   # Restart the application
   pm2 restart marmarica-tv
   
   # Check logs for errors
   pm2 logs marmarica-tv --lines 100
   ```

## Support

For support and inquiries, please contact the project maintainer or create an issue in the repository.
