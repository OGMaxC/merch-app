# Doomherre Merch App

Internal merch management tool for Doomherre.

## Features

- **Inventory** — items with colour/size variants, stock tracking, margin calculator
- **Shows** — show packs, live size-level tally, print sheet, reconcile
- **Investment** — per-person production cost tracking, recoup progress, profit split
- **Reports** — revenue by item/show/channel, size sell-through
- **Design planner** — pipeline from idea → artwork → printing → active

## Setup

### 1. Firebase

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project (e.g. `doomherre-merch`)
3. Add a **Web app** — copy the config values
4. Enable **Firestore Database** (europe-west region, production mode)
5. Set Firestore rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> Note: These rules are open — fine for a private internal tool. Add auth later if needed.

### 2. Configure the app

Open `js/firebase.js` and replace the placeholder values:

```js
const FIREBASE_CONFIG = {
  apiKey:    'YOUR_API_KEY',
  projectId: 'YOUR_PROJECT_ID',
};
```

### 3. Deploy to Netlify

1. Push to a new GitHub repo (e.g. `doomherre-merch`)
2. Connect repo to Netlify
3. Build settings: no build command, publish directory = `.`
4. Deploy

### Firestore collections

The app will create these automatically on first use:

| Collection | Contents |
|---|---|
| `merch_items` | Base designs with variant stock |
| `merch_shows` | Shows with packs and sales |
| `merch_transactions` | Investment payments and sales income |
| `merch_designs` | Design pipeline items |

## Local development

Just open `index.html` in a browser via a local server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

## Seeding initial data

After setup, add items directly through the Inventory page. For Doomherre, start with:

- Plaguelords logo shirt (clothing, black + burgundy)
- Bonegoat shirt (clothing, black)
- Plaguelords hoodie (clothing, black)
- Logo patch (other)
- Logo tote (other)
- Plaguelords LP (records)
- Bonegoat LP (records)
- Bonegoat CD (records)
