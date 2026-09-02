╔══════════════════════════════════════════════════════════╗
║          Lucerne POS — Desktop App Setup Guide          ║
║               نقطة البيع — دليل التثبيت               ║
╚══════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 REQUIREMENTS / المتطلبات
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 • Node.js 18+ — https://nodejs.org
 • Internet connection (the app loads your live store)
 • Your store must be deployed/published first

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 STEP 1 — Configure your store URL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Open config.json and replace the URL with your store URL:

   "url": "https://your-store.replit.app"

 Example / مثال:
   "url": "https://lucerne-boutique.replit.app"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 STEP 2 — Install dependencies
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Open a terminal/command prompt in this folder and run:

   npm install

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 STEP 3A — Run directly (no install needed)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   npm start

 This opens the POS window immediately. Use this for daily use
 without needing to build an .exe file.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 STEP 3B — Build as installer (.exe / .dmg)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 For Windows (.exe installer):
   npm run build:win

 For Mac (.dmg):
   npm run build:mac

 For Linux (.AppImage):
   npm run build:linux

 The output will be in the  dist/  folder.
 Install it like any other program.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 KEYBOARD SHORTCUTS / اختصارات لوحة المفاتيح
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 F5           → Reload / تحديث
 F11          → Toggle fullscreen / ملء الشاشة
 Alt+F4       → Quit / إغلاق (Windows)
 Cmd+Q        → Quit / إغلاق (Mac)
 POS menu     → Settings to change URL anytime

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ADDING A CUSTOM ICON (optional)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Replace the files in the  assets/  folder:
   assets/icon.ico   → Windows icon  (256x256 .ico)
   assets/icon.icns  → Mac icon      (.icns)
   assets/icon.png   → Linux icon    (512x512 PNG)

 You can convert a PNG to .ico for free at:
   https://convertio.co/png-ico/

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 HOW IT WORKS / كيف يعمل
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 The app opens your live store URL in a native desktop window.
 It connects to the same database as your online store —
 all orders, products, and stock are real-time and shared.

 Your login session is saved locally so you only log in once.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 SUPPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 lucernebq@gmail.com
