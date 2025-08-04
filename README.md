This is custom biling system for mikrotik routers with custom made plans that can be replaced according to the needs of the client

It uses STK PUSH from MPESA API DAJARA for automatic payments from the hotspot users Simple and Well intergrated

The Frontend use Vite for a simplicity for One pages validity 

The Backend uses typescript for type safety and packages like cors,express and Prisma  with data caps on the plans

The Backend Needs Enviroment Variables for it to Work:

  "DATABASE_URL",
  "MIKROTIK_HOST",
  "MIKROTIK_USER",
  "MIKROTIK_PASS",
  "MPESA_CONSUMER_KEY",
  "MPESA_CONSUMER_SECRET",
  "MPESA_SHORTCODE",
  "MPESA_PASSKEY"


ARE THE REQUIRED FOR THE FULL SYSTEM TO WORK

HOW TO START AND RUN THE APPLICATION:

First Clone the Repo:

git clone https://github.com/zilezarach/wifi-hotspot.git

Then run `npm install` in the frontend and `npm run build` to build the frontend first 

A dist folder will generated on the frontend copy it's contents to the backend folder under `public folder`

Then run `npm install` in the backend and `npm run build` to build the backend 

Then run `npm run dev` for local development or `npm run build` 
