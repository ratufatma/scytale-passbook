# Scytale Passbook

Independent desktop and mobile Passbook Canvas applications.

## Modules

- `desktop`: wide split-view with certificate card, two-column UTXO Vault, and full ledger journal.
- `mobile`: touch-first single-card layout with bottom navigation for Passbook Card, Mutations, UTXO Vault, and Scan QR.
- `shared`: canonical data types, node API client, and fallback fixtures.

## Run

```bash
npm install --prefix desktop
npm install --prefix mobile
npm run build
```

Both modules query `http://116.212.72.89:8332` through the shared node client and fall back to local fixture data when the node is unavailable.
