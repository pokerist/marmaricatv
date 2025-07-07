# Marmarica TV Deployment Guide

This guide provides step-by-step instructions for deploying the Marmarica TV IPTV Admin Panel on an Ubuntu server.

## Prerequisites

- Ubuntu Server 20.04 LTS or higher
- Node.js 16.x or higher
- npm 8.x or higher
- PM2 (Process Manager)
- Nginx
- Git

## Initial Server Setup

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

4. **Install Nginx**
   ```bash
   sudo apt install nginx
   ```

## Application Deployment

1. **Clone Repository**
   ```bash
   git clone https://github.com/pokerist/marmaricatv.git
   cd marmaricatv
   ```

2. **Setup Environment Variables**

   a. Generate JWT Secret:
   ```bash
   cd server
   node scripts/generate-jwt-secret.js
   # Save the generated secret securely
   ```

   b. Update Production Environment:
   ```bash
   # Edit .env.production with your values
   nano .env.production
   ```

   Important values to update:
   - CLIENT_URL
   - COOKIE_DOMAIN
   - JWT_SECRET (from step 2a)

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

5. **Configure Nginx**

   Create Nginx configuration:
   ```bash
   sudo nano /etc/nginx/sites-available/marmarica-tv
   ```

   Add the following configuration:
   ```nginx
   server {
       listen 80;
       server_name your_domain.com;

       # Redirect HTTP to HTTPS
       return 301 https://$server_name$request_uri;
   }

   server {
       listen 443 ssl;
       server_name your_domain.com;

       # SSL configuration
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;

       # Security headers
       add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
       add_header X-Frame-Options "SAMEORIGIN" always;
       add_header X-XSS-Protection "1; mode=block" always;
       add_header X-Content-Type-Options "nosniff" always;

       # React static files
       location / {
           root /path/to/marmaricatv/client/build;
           try_files $uri /index.html;
           expires 1d;
           add_header Cache-Control "public, max-age=86400";
       }

       # API endpoints
       location /api {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           
           # CORS headers for API
           add_header 'Access-Control-Allow-Origin' 'https://your_domain.com' always;
           add_header 'Access-Control-Allow-Credentials' 'true' always;
           add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
           add_header 'Access-Control-Allow-Headers' 'Accept,Authorization,Cache-Control,Content-Type,DNT,If-Modified-Since,Keep-Alive,Origin,User-Agent,X-Requested-With' always;
       }

       # Uploaded files
       location /uploads {
           alias /path/to/marmaricatv/server/uploads;
           expires 1d;
           add_header Cache-Control "public, max-age=86400";
       }
   }
   ```

   Enable the configuration:
   ```bash
   sudo ln -s /etc/nginx/sites-available/marmarica-tv /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

6. **Start Application with PM2**

   Create ecosystem file:
   ```bash
   cd /path/to/marmaricatv
   nano ecosystem.config.js
   ```

   Add configuration:
   ```javascript
   module.exports = {
     apps: [{
       name: 'marmarica-tv',
       script: 'server/index.js',
       env_production: {
         NODE_ENV: 'production',
         PORT: 5000
       },
       instances: 1,
       autorestart: true,
       watch: false,
       max_memory_restart: '1G',
       env_file: 'server/.env.production'
     }]
   };
   ```

   Start the application:
   ```bash
   pm2 start ecosystem.config.js --env production
   pm2 save
   pm2 startup
   ```

## Security Considerations

1. **Firewall Setup**
   ```bash
   sudo ufw allow 'Nginx Full'
   sudo ufw allow OpenSSH
   sudo ufw enable
   ```

2. **SSL Certificate**
   Install Certbot and obtain SSL certificate:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your_domain.com
   ```

3. **File Permissions**
   ```bash
   # Set proper ownership
   sudo chown -R www-data:www-data /path/to/marmaricatv/server/uploads
   
   # Set proper permissions
   sudo chmod -R 755 /path/to/marmaricatv/server/uploads
   ```

## Backup Setup

1. **Create Backup Directory**
   ```bash
   sudo mkdir -p /var/backups/marmarica-tv
   ```

2. **Create Backup Script**
   ```bash
   sudo nano /usr/local/bin/backup-marmarica-tv.sh
   ```

   Add script content:
   ```bash
   #!/bin/bash
   
   BACKUP_DIR="/var/backups/marmarica-tv"
   APP_DIR="/path/to/marmaricatv"
   DATE=$(date +%Y%m%d_%H%M%S)
   
   # Backup database
   cp $APP_DIR/server/database.sqlite $BACKUP_DIR/database_$DATE.sqlite
   
   # Backup uploads
   tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz $APP_DIR/server/uploads
   
   # Backup env files
   cp $APP_DIR/server/.env.production $BACKUP_DIR/env_production_$DATE
   
   # Keep only last 30 days of backups
   find $BACKUP_DIR -type f -mtime +30 -delete
   ```

   Make script executable:
   ```bash
   sudo chmod +x /usr/local/bin/backup-marmarica-tv.sh
   ```

3. **Setup Daily Backups**
   ```bash
   sudo crontab -e
   ```

   Add cron job:
   ```
   0 0 * * * /usr/local/bin/backup-marmarica-tv.sh
   ```

## Monitoring

1. **PM2 Monitoring**
   ```bash
   pm2 monit
   ```

2. **Log Files**
   - Application Logs: `~/.pm2/logs/`
   - Nginx Access Logs: `/var/log/nginx/access.log`
   - Nginx Error Logs: `/var/log/nginx/error.log`

## Maintenance

1. **Update Application**
   ```bash
   cd /path/to/marmaricatv
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
   # Compact database
   cd /path/to/marmaricatv/server
   sqlite3 database.sqlite "VACUUM;"
   ```

## Troubleshooting

1. **Check Application Status**
   ```bash
   pm2 status
   pm2 logs marmarica-tv
   ```

2. **Check Nginx Status**
   ```bash
   sudo systemctl status nginx
   sudo nginx -t
   ```

3. **Common Issues**

   a. Permission Issues:
   ```bash
   sudo chown -R $USER:$USER /path/to/marmaricatv
   sudo chmod -R 755 /path/to/marmaricatv
   ```

   b. Port Issues:
   ```bash
   # Check if ports are in use
   sudo netstat -tulpn | grep -E ':80|:443|:5000'
   ```

   c. SSL Issues:
   ```bash
   # Renew SSL certificate
   sudo certbot renew --dry-run
   ```

## Support

For support and inquiries, please contact the project maintainer or create an issue in the repository.
