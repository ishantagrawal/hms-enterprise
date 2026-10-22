# HMS Enterprise

## Run the frontend

From the repository root:

```sh
npm install --prefix frontend
npm run dev
```

## Run the backend locally

In a separate terminal:

```sh
python -m pip install -r backend/requirements.txt
npm run dev:backend
```

To use the local backend, set `VITE_API_URL=http://127.0.0.1:8000` in
`frontend/.env.local` before starting the frontend. Otherwise, the frontend
uses its configured hosted API.

## Verify the frontend

```sh
npm run build
npm run lint
```
