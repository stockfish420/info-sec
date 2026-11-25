# SecureVault

SecureVault encrypts files using AES-256-GCM or ChaCha20-Poly1305 and includes benchmark and metrics views. The frontend is a Next.js App Router application; the API is a FastAPI service.

## Backend

From the repository root, install the backend dependencies and start the API:

```powershell
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API is available at `http://localhost:8000` and interactive docs are at `http://localhost:8000/docs`.

## Frontend

In a second terminal, from the repository root:

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. The `.env.local` file points the frontend at the local API and disables mock mode. Set the same variables in the Vercel project environment for a deployed frontend, using a publicly reachable backend URL.

## Tests

From `backend/`:

```powershell
pip install -r requirements.txt
pytest
```

## System-aware benchmark recommendation

The Benchmark tab reads the API host's OS, processor, effective CPU cores, visible memory, and a measured scrypt cost from `GET /api/system-info`. It then uses benchmark timings from that backend and compares a working-memory estimate (the larger of about 3× the file size or the file size plus scrypt's ≈32 MB workspace) with available memory. An optional total-time limit can be set in the tab; that estimate includes the detected scrypt cost. The fastest measured authenticated cipher that meets the limits is recommended; DES-CBC is never recommended. In Vercel, the detected machine is the Vercel API runtime, not the browser or a connected IoT device. Container limits are reported when available; otherwise the app asks for a manual memory budget rather than treating host-visible memory as a runtime limit.

## Manual test checklist

1. Encrypt a small file in Vault and download the `.vault` output.
2. Decrypt it with the same password and compare it with the original.
3. Decrypt with a wrong password and confirm authentication fails without a download.
4. Tamper with an encrypted file, then confirm decrypting it fails.
5. Run a cipher benchmark, refresh Metrics Log, and confirm operations appear.
