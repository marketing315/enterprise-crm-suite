# OAuth Channels - Google & Meta Ads Integration

**Stato**: ⏳ In attesa configurazione cliente  
**Data**: 2026-02-03

---

## 1. Panoramica

Per importare dati pubblicitari da Google Ads e Meta Ads, il CRM supporta due metodi:

| Metodo | Complessità | Quando usarlo |
|--------|-------------|---------------|
| **API Key diretta** | Bassa | Account singolo, import manuale |
| **OAuth 2.0 Flow** | Alta | Multi-account, refresh automatico |

---

## 2. Architettura OAuth (Raccomandato)

### 2.1 Google Ads

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   CRM Frontend  │────▶│  Edge Function   │────▶│ Google OAuth 2  │
│                 │     │ google-oauth     │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │ oauth_tokens     │
                        │ (encrypted)      │
                        └──────────────────┘
```

**Prerequisiti da cliente:**
1. Creare progetto in [Google Cloud Console](https://console.cloud.google.com)
2. Abilitare Google Ads API
3. Creare OAuth 2.0 Client ID (Web Application)
4. Configurare redirect URI: `https://<project>.supabase.co/functions/v1/google-oauth-callback`
5. Fornire: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

### 2.2 Meta Ads (Facebook/Instagram)

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   CRM Frontend  │────▶│  Edge Function   │────▶│ Meta OAuth 2    │
│                 │     │ meta-oauth       │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

**Prerequisiti da cliente:**
1. Creare Meta App in [Meta for Developers](https://developers.facebook.com)
2. Aggiungere prodotto "Marketing API"
3. Configurare redirect URI
4. Fornire: `META_APP_ID`, `META_APP_SECRET`

---

## 3. Database Schema

```sql
-- Tabella per token OAuth (crittografati)
CREATE TABLE public.oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) NOT NULL,
  provider TEXT NOT NULL, -- 'google_ads' | 'meta_ads'
  account_id TEXT NOT NULL, -- ID account sulla piattaforma
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(brand_id, provider, account_id)
);

-- RLS: Solo Admin/CEO
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage OAuth tokens"
ON oauth_tokens FOR ALL
USING (has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin') 
       OR has_role(get_user_id(auth.uid()), 'ceo'));
```

---

## 4. Edge Functions da Implementare

### 4.1 `google-oauth-start`
Inizia il flow OAuth, redirect a Google.

### 4.2 `google-oauth-callback`
Riceve il code da Google, scambia per token, salva in DB.

### 4.3 `google-ads-sync`
Usa token per chiamare Google Ads API e popolare `ad_platform_stats`.

### 4.4 `meta-oauth-start` / `meta-oauth-callback` / `meta-ads-sync`
Analogo per Meta.

---

## 5. UI Settings

Aggiungere in **Settings → Marketing**:

```tsx
// Componente OAuthChannelsSettings.tsx
- Lista account collegati (provider, account_id, expires_at)
- Pulsante "Collega Google Ads" → apre popup OAuth
- Pulsante "Collega Meta Ads" → apre popup OAuth
- Azione "Scollega" per rimuovere token
- Azione "Sincronizza ora" per trigger manuale
```

---

## 6. Checklist Implementazione

| Step | Descrizione | Stato |
|------|-------------|-------|
| 1 | Cliente crea Google Cloud Project | ⏳ |
| 2 | Cliente crea Meta App | ⏳ |
| 3 | Ricevere Client ID/Secret | ⏳ |
| 4 | Creare migration `oauth_tokens` | ❌ |
| 5 | Implementare edge functions OAuth | ❌ |
| 6 | Implementare UI collegamento | ❌ |
| 7 | Implementare sync automatico (cron) | ❌ |

---

## 7. Sicurezza

- **Token crittografati**: Usare Vault o encrypt/decrypt con chiave server-side
- **Refresh automatico**: Edge function scheduled per refresh token prima di scadenza
- **Scope minimi**: Richiedere solo `ads.readonly` / `ads_read`
- **RLS stretto**: Solo Admin/CEO vedono e gestiscono token

---

## 8. Alternative Semplificata (API Key)

Se il cliente preferisce non implementare OAuth:

1. Generare API key/token a lungo termine dalla piattaforma
2. Salvare come secret in Supabase
3. Usare edge function per import manuale

**Pro**: Semplice  
**Contro**: Scade, richiede intervento manuale, meno sicuro

---

## Note per il Cliente

Per procedere con l'implementazione OAuth, fornire:

**Google Ads:**
- [ ] `GOOGLE_CLIENT_ID`
- [ ] `GOOGLE_CLIENT_SECRET`
- [ ] ID account Google Ads da collegare

**Meta Ads:**
- [ ] `META_APP_ID`
- [ ] `META_APP_SECRET`
- [ ] Pixel ID / Ad Account ID
