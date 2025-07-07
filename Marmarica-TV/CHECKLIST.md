# Marmarica TV Deployment Checklist

## Pre-Deployment

### Environment Setup
- [ ] Update server/.env.production with:
  - [ ] JWT_SECRET
  - [ ] PORT=80
  - [ ] CLIENT_URL=http://155.138.231.215
  - [ ] COOKIE_DOMAIN=155.138.231.215

- [ ] Update client/.env with:
  - [ ] REACT_APP_API_URL=http://155.138.231.215/api
  - [ ] REACT_APP_UPLOADS_URL=http://155.138.231.215/uploads

### Server Preparation
- [ ] Install Node.js 16.x
- [ ] Install PM2 globally
- [ ] Create /var/www directory
- [ ] Set correct permissions

## Deployment Steps

### Application Setup
- [ ] Clone repository to /var/www/marmaricatv
- [ ] Install server dependencies
- [ ] Install client dependencies
- [ ] Build client application
- [ ] Run database setup script
- [ ] Run channel ordering setup script
- [ ] Start application with PM2

### Permission Setup
- [ ] Set uploads directory permissions
- [ ] Set logs directory permissions
- [ ] Set backup directory permissions

### Backup Configuration
- [ ] Create backup directory
- [ ] Setup backup script
- [ ] Configure cron job

## Post-Deployment Checks

### Functionality
- [ ] Verify admin login works
- [ ] Test channel reordering
- [ ] Check file uploads
- [ ] Verify client API access
- [ ] Test device registration

### System
- [ ] Check PM2 process status
- [ ] Verify port 80 is accessible
- [ ] Test backup system
- [ ] Check log files

## Quick Commands

### Start Application
```bash
cd /var/www/marmaricatv/server
pm2 start index.js --name marmarica-tv
pm2 save
```

### Check Status
```bash
pm2 status
pm2 logs marmarica-tv
```

### Restart Application
```bash
pm2 restart marmarica-tv
```

### Update Application
```bash
cd /var/www/marmaricatv
git pull
cd server && npm install
cd ../client && npm install && npm run build
pm2 restart marmarica-tv
```

## Common Issues

### Port 80 in Use
```bash
sudo netstat -tulpn | grep :80
# Stop conflicting service or change port in .env.production
```

### Permission Issues
```bash
sudo chown -R $USER:$USER /var/www/marmaricatv
sudo chmod -R 755 /var/www/marmaricatv
```

### Database Issues
```bash
cd /var/www/marmaricatv/server
node scripts/setup-admin.js
# Follow prompts to reset admin account
```

## Contact

For deployment support, contact the project maintainer.
