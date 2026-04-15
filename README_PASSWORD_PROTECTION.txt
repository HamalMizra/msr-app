Files updated for simple password protection.

What was added:
- login.html
- auth.js
- Backend items.js now checks HAMAL_SECRET via x-hamal-key header

What to do:
1. Put the files from this folder into your project folder.
2. Ensure .env contains:
   HAMAL_SECRET=your_password
3. Restart:
   netlify dev

Expected behavior:
- Opening any app page without login redirects to login.html
- Direct browser access to /api/items returns {"error":"Unauthorized"}
- After login, app pages work normally
