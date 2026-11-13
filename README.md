# AirMesh Editorial

A separate, editorial landing-page experience for AirMesh. This repository is independent of the original AirMesh application.

## Stack
- React 18 and Vite 6
- Responsive CSS scroll choreography
- OpenAQ v3 station endpoint

## Local development
```bash
npm install
npm run dev
npm run build
```

## Live data
The page requests `/api/air-quality`. Configure the serverless endpoint and `OPENAQ_API_KEY` in your hosting environment. The configured station is Kadri, Mangalore - KSPCB (OpenAQ location 44513), with CPCB observations provided through OpenAQ. If the endpoint cannot be reached, the page explicitly reports unavailable readings; it does not generate sample measurements.

Pollutant observations are shown in their reported units and are not represented as an official CPCB AQI calculation. No API keys or secrets belong in this repository.

## Alerts
The email field is a contact handoff, not an automatic subscription. It does not claim that a visitor has been enrolled in notifications.
