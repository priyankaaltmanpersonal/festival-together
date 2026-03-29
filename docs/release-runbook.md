# Festival Together — Release Runbook

This document walks through every account setup, secret, and build step needed to get
Festival Together running in production and distributed to your group for Coachella 2026.

---

## 1. Accounts you need (one-time setup)

### Anthropic (for schedule parsing)
1. Go to console.anthropic.com → create an account.
2. Go to **API Keys** → create a key.
3. Copy the key — you'll need it for Render and local dev.
4. **Cost**: Claude Sonnet 4.6 vision is ~$3/MTok input, ~$15/MTok output. Parsing one
   screenshot (compressed JPEG) uses ~1,000–2,000 input tokens + ~200 output tokens.
   12 members × 3 days × 1–2 uploads = ~100 calls total → well under $1.

### Neon (Postgres database)
1. Go to neon.tech → sign up (free tier, no credit card required).
2. Create a project named "festival-together".
3. Create a database named "festival_together".
4. Copy the **connection string** from the dashboard.
5. Free tier limit: 0.5 GB storage, 1 compute unit. More than enough for 12 people.

### Render (API hosting)
1. Go to render.com → sign up with GitHub (connect your festival-together repo).
2. Click **New → Web Service** → select the `festival-together` repo.
3. Set these values:
   - **Root directory**: `services/api`
   - **Build command**: `pip install -e .`
   - **Start command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Plan**: Starter ($7/month) — no cold starts
4. In **Environment**, add these secrets:
   - `DATABASE_URL` → your Neon connection string
   - `ANTHROPIC_API_KEY` → your Anthropic API key
   - `APP_ENV` → `production`
5. Click **Create Web Service**. First deploy takes ~3 minutes.
6. Your API URL will be: `https://festival-together-api.onrender.com`
7. **Cost ceiling**: Render Starter is flat $7/month. No surprises.

### Apple Developer Program (iOS TestFlight)
1. Go to developer.apple.com → enroll in the Apple Developer Program ($99/year).
   This takes 1-2 business days to approve if you haven't enrolled before.
2. Once approved, go to appstoreconnect.apple.com:
   - **Apps → + New App**
   - Platform: iOS, Name: "Festival Together", Bundle ID: `com.festivaltogether.app`
   - SKU: `festival-together-2026`
3. Note your **Apple ID email**, **App Store Connect App ID** (10-digit number in the URL),
   and **Team ID** (from Membership page in developer.apple.com).
4. Update `apps/mobile/eas.json` → replace the three `REPLACE_WITH_*` placeholders.

### Google Play (Android — optional)
1. Go to play.google.com/console → pay the $25 one-time registration fee.
2. Create a new app: "Festival Together", default language English.
3. For distributing to your group without Play Store review, use **Internal testing track**
   — add testers by email directly, no review needed.

---

## 2. Local development setup

```bash
# Install API dependencies
cd services/api
pip install -e .

# Set environment variables (copy and fill in values)
cp .env.example .env
# Edit .env:
#   DATABASE_URL=         # leave blank to use SQLite locally
#   ANTHROPIC_API_KEY=your-key-here

# Run the API
uvicorn app.main:app --reload

# In a separate terminal, run the mobile app
cd apps/mobile
npm install
npx expo start
```

The mobile app defaults to `http://127.0.0.1:8000` when `EXPO_PUBLIC_API_BASE_URL` is not set.

---

## 3. Running tests

```bash
cd services/api
pytest tests/ -v
```

All tests mock the Anthropic API — no real credentials needed and no charges incurred.

---

## 4. Building and distributing the mobile app (EAS Build)

### Prerequisites
```bash
npm install -g eas-cli
eas login   # login with your Expo account (create one free at expo.dev)
```

### iOS — TestFlight (for your group)

```bash
cd apps/mobile

# Build for TestFlight (production profile)
eas build --platform ios --profile production

# When prompted, EAS will ask to create/use an Apple Distribution Certificate
# and Provisioning Profile — let it manage these automatically.

# After build completes (~10-15 min), submit to TestFlight:
eas submit --platform ios --profile production --latest

# In App Store Connect → TestFlight → add your testers by email.
# They get an email invite and install via the TestFlight app.
```

### Android — Internal testing track

```bash
cd apps/mobile

# Build AAB for Play Store
eas build --platform android --profile production

# Submit to internal testing track
eas submit --platform android --profile production --latest

# In Play Console → Internal testing → Testers → add emails
# Testers get a link to install directly (no review needed)
```

### Preview builds (for quick testing before submitting)

```bash
# Builds a .ipa / .apk installable via QR code — useful for quick smoke tests
eas build --platform ios --profile preview
eas build --platform android --profile preview
```

---

## 5. Updating the API URL in the app

The production API URL is set via the `EXPO_PUBLIC_API_BASE_URL` environment variable
in `eas.json` build profiles. It is currently set to:

```
https://festival-together-api.onrender.com
```

If your Render service URL is different, update it in `apps/mobile/eas.json` under
`build.preview.env` and `build.production.env`.

---

## 6. Checklist before distributing to your group

- [ ] Render service is live and healthy (visit `https://your-render-url.onrender.com/health`)
- [ ] Neon database is connected (check Render logs for startup success)
- [ ] `ANTHROPIC_API_KEY` is active (test: upload a screenshot in the app and confirm parse works)
- [ ] `GOOGLE_VISION_API_KEY` removed from Render env (no longer used — leftover from old pipeline)
- [ ] iOS TestFlight build submitted and approved by Apple (usually <24h for internal builds)
- [ ] All testers have accepted TestFlight invites
- [ ] Founder has completed group setup (festival days set, at least one day uploaded)
- [ ] Invite code shared with group members

---

## 7. Monitoring and support

- **Render logs**: render.com → your service → Logs tab
- **Neon usage**: neon.tech → your project → Monitoring
- **Anthropic usage**: console.anthropic.com → Usage
- **EAS build history**: expo.dev → your project → Builds

---

## 8. Cost summary

| Service | Cost |
|---|---|
| Render Starter | $7/month |
| Neon free tier | $0 |
| Anthropic (Claude vision, ~100 calls) | <$1 one-time |
| Apple Developer Program | $99/year |
| Google Play (optional) | $25 one-time |
| **Total for Coachella 2026** | **~$100 one-time + $7/month** |

You can cancel Render after the festival to stop the $7/month charge.
