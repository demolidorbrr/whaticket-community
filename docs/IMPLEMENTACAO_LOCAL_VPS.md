# Implementacao Local e Deploy em VPS (Hostinger)

Este guia substitui o fluxo antigo do README para um setup mais previsivel em 2026.

## 1) Escopo e alertas

- Stack: backend Node.js + frontend React/Vite + MariaDB + Nginx (Docker Compose).
- Requisito de runtime: Node.js 20.
- Risco operacional: `whatsapp-web.js` usa cliente nao oficial; existe risco de bloqueio do numero.

## 2) Ambiente local (teste funcional)

### 2.1 Pre-requisitos

- Docker Desktop (com WSL2 no Windows).
- Git.

### 2.2 Subida local

Na raiz do projeto:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Defina valores minimos:

- `.env`: `MYSQL_ROOT_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`.
- `backend/.env`: `DB_PASS` igual ao `MYSQL_ROOT_PASSWORD`.

Suba os containers:

```bash
docker compose -f docker-compose.yaml up -d --build
```

Execute seed inicial:

```bash
docker compose -f docker-compose.yaml exec backend npx sequelize db:seed:all
```

Acesse:

- Frontend: `http://localhost:3000`
- Signup inicial: `http://localhost:3000/signup`

### 2.3 Checklist de validacao

- Criar usuario e autenticar.
- Abrir `Connections`, criar conexao WhatsApp e ler QR code.
- Enviar mensagem para o numero conectado e confirmar criacao de ticket.

## 3) Deploy em VPS Hostinger

### 3.1 Requisitos recomendados

- Ubuntu 22.04+.
- 2 vCPU, 4 GB RAM, 80 GB SSD.
- DNS com 2 subdominios apontando para a VPS:
  - `app.seudominio.com` (frontend)
  - `api.seudominio.com` (backend)

### 3.2 Instalar Docker e Compose Plugin

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

### 3.3 Subir aplicacao

```bash
git clone https://github.com/canove/whaticket-community.git whaticket
cd whaticket
cp .env.example .env
cp backend/.env.example backend/.env
mkdir -p ssl/certs/backend ssl/certs/frontend ssl/www
```

Ajuste `.env` (producao):

- `BACKEND_SERVER_NAME=api.seudominio.com`
- `BACKEND_URL=https://api.seudominio.com`
- `FRONTEND_SERVER_NAME=app.seudominio.com`
- `FRONTEND_URL=https://app.seudominio.com`
- `PROXY_PORT=443`
- `MYSQL_ROOT_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET` fortes

Ajuste `backend/.env`:

- `DB_HOST=mysql`
- `DB_PORT=3306`
- `DB_USER=root`
- `DB_PASS=<mesmo MYSQL_ROOT_PASSWORD>`
- `DB_NAME=whaticket`
- `BACKEND_URL=https://api.seudominio.com`
- `FRONTEND_URL=https://app.seudominio.com`
- `PROXY_PORT=443`

Suba:

```bash
docker compose -f docker-compose.yaml up -d --build
docker compose -f docker-compose.yaml exec backend npx sequelize db:seed:all
```

### 3.4 SSL (Let's Encrypt)

Instale certbot:

```bash
sudo snap install --classic certbot
```

Gere certificados com webroot da stack:

```bash
sudo certbot certonly --cert-name backend --webroot --webroot-path ./ssl/www/ -d api.seudominio.com
sudo certbot certonly --cert-name frontend --webroot --webroot-path ./ssl/www/ -d app.seudominio.com
```

Copie para os caminhos esperados:

```bash
sudo cp /etc/letsencrypt/live/backend/fullchain.pem ./ssl/certs/backend/fullchain.pem
sudo cp /etc/letsencrypt/live/backend/privkey.pem ./ssl/certs/backend/privkey.pem
sudo cp /etc/letsencrypt/live/frontend/fullchain.pem ./ssl/certs/frontend/fullchain.pem
sudo cp /etc/letsencrypt/live/frontend/privkey.pem ./ssl/certs/frontend/privkey.pem
docker compose -f docker-compose.yaml restart frontend
```

## 4) Operacao basica

- Ver logs backend: `docker compose -f docker-compose.yaml logs -f backend`
- Ver logs frontend: `docker compose -f docker-compose.yaml logs -f frontend`
- Backup banco (volume): `./.docker/data`
- Persistencia sessao WhatsApp: `backend/.wwebjs_auth`

## 5) Observacoes sobre Redis

- Redis e opcional.
- Para `WHATSAPP_PROVIDER=whaileys`, configure no `backend/.env`:
  - `REDIS_URL=redis://usuario:senha@host:6379`
  - `REDIS_DB=0`

## 6) Observacoes sobre Proxy e risco de banimento

- Proxy pode reduzir risco operacional, mas nao elimina risco de bloqueio.
- Para `wwebjs`, configure em `.env`:
  - `WHATSAPP_PROVIDER=wwebjs`
  - `CHROME_ARGS=--no-sandbox --disable-setuid-sandbox --proxy-server=http://IP:PORTA`
- Para `whaileys`, configure em `.env`:
  - `WHATSAPP_PROVIDER=whaileys`
  - `PROXY_ADDRESS=IP:PORTA`
  - `PROXY_AUTH=usuario:senha` (opcional)
  - `REDIS_URL=redis://usuario:senha@host:6379` (recomendado)
- Apos alterar variaveis, recrie backend:
  - `docker compose -f docker-compose.yaml up -d --force-recreate backend`

## 7) Importacao de contatos CSV (Google Contacts)

- O botao `Importar Contatos` da tela de contatos importa da sessao WhatsApp conectada, nao de arquivo CSV.
- Para importar CSV exportado do Google Contacts use:
  - `powershell -ExecutionPolicy Bypass -File scripts/import-google-contacts.ps1 -CsvPath "C:\caminho\contacts.csv" -DryRun`
  - `powershell -ExecutionPolicy Bypass -File scripts/import-google-contacts.ps1 -CsvPath "C:\caminho\contacts.csv"`
- O script:
  - normaliza telefone para formato internacional em digitos (`E.164` sem `+`);
  - remove caracteres e descarta numeros de servico (`0800`, `3003`, `4004`);
  - deduplica por numero e faz `INSERT IGNORE` para evitar erro de duplicidade.
