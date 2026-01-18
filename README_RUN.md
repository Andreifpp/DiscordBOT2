Instrucciones rápidas para ejecutar el bot localmente

1) Instalar dependencias

En PowerShell (desde la raíz del proyecto):

```powershell
npm install
```

2) Crear archivo `.env`

Copia `.env.example` a `.env` y rellena `TOKEN` con el token de tu bot (no compartas este archivo):

```powershell
cp .env.example .env
# editar .env con tu editor y añadir TOKEN
```

Alternativa en PowerShell (temporal, sin .env):

```powershell
$env:TOKEN = "YOUR_BOT_TOKEN_HERE"; node .\index.js
```

3) Ejecutar el bot

```powershell
npm run start
# o en desarrollo con recarga automática
npm run dev
```

4) Variables opcionales

Si usas Supabase/SellAuth o una API de facturas, rellena las variables relacionadas en `.env`:
- SUPABASE_URL, SUPABASE_KEY, SUPABASE_TABLE
- INVOICES_API_URL
- SELLAUTH_API_KEY, SELLAUTH_SHOP_ID

5) Seguridad
- No subas `.env` al repositorio. Asegúrate de que `.gitignore` contiene `.env`.

6) Problemas comunes
- "Cannot find module 'dotenv'": ejecutar `npm install dotenv --save`.
- "TOKEN no definido": agregar `TOKEN` al `.env` o pasar la variable en la línea de comandos.

Si quieres que yo haga más cambios (por ejemplo: convertir el flujo de modales a DM-based para evitar fallos en Render), dime y lo implemento.