# Karunadu Editors Club — Community Chat Backend (Cloudflare)

This backend runs on **Cloudflare Workers** with **Cloudflare D1** (Serverless SQL Database) and **Cloudflare R2** (Zero-egress Object Storage for screenshots).

---

## ⚡ Free Tier Cost
- **Workers**: 100,000 requests/day ($0/month)
- **D1 Database**: 5,000,000 reads/day, 100,000 writes/day ($0/month)
- **R2 Storage**: 10 GB storage, $0 egress ($0/month)

---

## 🚀 Setup & Deployment Steps (Takes ~3 minutes)

### Step 1: Install Wrangler CLI (if not already installed)
In your terminal, navigate to the `backend` folder:
```bash
cd backend
npm install
```

### Step 2: Log into your free Cloudflare account
```bash
npx wrangler login
```
*(A browser window will open asking you to authorize Wrangler. Click Allow.)*

### Step 3: Create the D1 Database
Run this command in the `backend` directory:
```bash
npx wrangler d1 create kec-chat-db
```
You will get output like:
```text
[[d1_databases]]
binding = "DB"
database_name = "kec-chat-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```
Copy that `database_id` and paste it into [wrangler.toml](file:///d:/Deeps/Portfolio%20Website/KEC/backend/wrangler.toml) under `database_id`.

### Step 4: Create the R2 Storage Bucket (for 24h screenshots)
```bash
npx wrangler r2 bucket create kec-chat-attachments
```

### Step 5: Initialize the Database Tables
Apply the SQL schema to your remote Cloudflare database:
```bash
npx wrangler d1 execute kec-chat-db --remote --file=./schema.sql
```

### Step 6: Deploy to Cloudflare
```bash
npx wrangler deploy
```

Wrangler will output your live API URL, for example:
`https://kec-community-chat-api.<your-subdomain>.workers.dev`

---

## 🔗 Connect Frontend to the Live Backend
Once deployed, in [community-chat.html](file:///d:/Deeps/Portfolio%20Website/KEC/community-chat.html), set:
```javascript
const CLOUDFLARE_API_URL = 'https://kec-community-chat-api.<your-subdomain>.workers.dev';
```
When `CLOUDFLARE_API_URL` is set, the frontend will automatically switch from local-only storage to global live sync across all users!
