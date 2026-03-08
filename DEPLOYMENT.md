# 🚀 Deployment Guide

This guide covers deploying the WiFi Hotspot Billing System to a production Linux server.

---

## 📋 Server Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| OS | Ubuntu 20.04 LTS | Ubuntu 22.04 LTS |
| RAM | 1 GB | 2 GB |
| CPU | 1 vCPU | 2 vCPU |
| Disk | 20 GB | 40 GB |
| Node.js | 18.x | 20.x LTS |
| PostgreSQL | 15 | 15 |

> ⚠️ The server must have a **public IP address** and a valid domain name so M-Pesa can reach the callback URL over HTTPS.

---

## 1. Install Dependencies

```bash
# Node.js (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm
npm install -g pnpm

# PM2 process manager
npm install -g pm2

# PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# Nginx
sudo apt-get install -y nginx

# Certbot (Let's Encrypt SSL)
sudo apt-get install -y certbot python3-certbot-nginx
```

---

## 2. Database Setup

```bash
sudo -u postgres psql

-- Inside psql:
CREATE USER hotspot_user WITH PASSWORD 'strong_password_here';
CREATE DATABASE hotspot_db OWNER hotspot_user;
GRANT ALL PRIVILEGES ON DATABASE hotspot_db TO hotspot_user;
\q
```

Set `DATABASE_URL` in your `.env`:

```
DATABASE_URL=postgresql://hotspot_user:strong_password_here@localhost:5432/hotspot_db
```

---

## 3. Clone and Build

```bash
git clone https://github.com/zilezarach/wifi-hotspot.git
cd wifi-hotspot

# Build frontend
cd frontend
pnpm install
pnpm build
cp -r dist/* ../backend/public/

# Install backend dependencies
cd ../backend
pnpm install
cp .env.example .env
# Edit .env with production values
nano .env
```

---

## 4. Environment Variables for Production

```bash
# .env (production)
NODE_ENV=production
SERVER_PORT=5000
SERVER_IP=0.0.0.0
DOMAIN=https://yourdomain.com

DATABASE_URL=postgresql://hotspot_user:strong_password@localhost:5432/hotspot_db

MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_SHORTCODE=your_shortcode
MPESA_PASSKEY=your_passkey
MPESA_CALLBACK_URL=https://yourdomain.com/api/mpesa/callback

ENCRYPTION_KEY=run_pnpm_generate_key_and_paste_output_here
```

---

## 5. Run Database Migrations

```bash
cd backend
pnpm migrate
# Optionally seed initial data
pnpm seed
```

---

## 6. Build Backend

```bash
cd backend
pnpm build
```

---

## 7. Run with PM2

Create a PM2 ecosystem file `ecosystem.config.js` in the `backend/` folder:

```js
module.exports = {
  apps: [
    {
      name: 'hotspot-backend',
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```

Start the application:

```bash
cd backend
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup  # Follow the printed command to enable auto-start on reboot
```

Useful PM2 commands:

```bash
pm2 status             # Check process status
pm2 logs hotspot-backend  # View logs
pm2 restart hotspot-backend
pm2 stop hotspot-backend
```

---

## 8. Nginx Reverse Proxy

Create `/etc/nginx/sites-available/hotspot`:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/hotspot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 9. SSL Certificate (Let's Encrypt)

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Certbot automatically renews certificates. Test renewal:

```bash
sudo certbot renew --dry-run
```

---

## 10. Database Migrations (on updates)

```bash
cd backend
git pull
pnpm install
pnpm migrate
pnpm build
pm2 restart hotspot-backend
```

---

## 11. Monitoring and Logging

Logs are written to `backend/error.log` by Winston. PM2 also maintains process logs:

```bash
pm2 logs hotspot-backend --lines 200
tail -f backend/error.log
```

To set up log rotation:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
```

---

## 12. Backup Strategy

**Database backup:**

```bash
# Daily backup cron job
pg_dump hotspot_db -U hotspot_user -F c -f /backups/hotspot_$(date +%Y%m%d).dump
```

Add to crontab (`crontab -e`):

```
0 2 * * * pg_dump hotspot_db -U hotspot_user -F c -f /backups/hotspot_$(date +\%Y\%m\%d).dump
```

**Restore from backup:**

```bash
pg_restore -U hotspot_user -d hotspot_db /backups/hotspot_20240101.dump
```

---

## ✅ Production Checklist

- [ ] `NODE_ENV=production` is set
- [ ] HTTPS is enabled and `MPESA_CALLBACK_URL` uses `https://`
- [ ] `ENCRYPTION_KEY` is a random 32-byte hex string (never committed to git)
- [ ] Database password is strong
- [ ] Firewall allows only ports 80, 443, and 22
- [ ] PM2 startup script is configured
- [ ] Log rotation is set up
- [ ] Database backups are scheduled
