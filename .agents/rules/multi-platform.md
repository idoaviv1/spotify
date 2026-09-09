# כלל ברזל: סנכרון רב-פלטפורמי אוטומטי (Web, iPhone, Galaxy)

מעכשיו, בכל פעם שמבצעים תיקון באג, שינוי עיצובי, תכונה חדשה או עדכון כלשהו בפרויקט Homeify (`/home/idodi/Projects/spotify`), **חובה ליישם, לסנכרן ולקמפל את השינוי אוטומטית בכל שלושת הגרסאות של האפליקציה**:

1. **גרסת ה-Web (אתר / שרת)**:
   - קוד צד לקוח נבנה ל-`frontend/dist` (`npm run build`).
   - שרת FastAPI מתעדכן ומאותחל (`sudo systemctl restart soniclink.service`).

2. **גרסת האייפון (iPhone / iOS)**:
   - סנכרון עם Capacitor: `npx cap sync ios`.
   - תוצר IPA נוצר ונשמר ב-`/media/windows/Shared-IPA/` (`C:\Shared-IPA\`) תחת השמות:
     - `Homeify.ipa`
     - `Homeify-unsigned.ipa`
     - `Homeify-<version>-unsigned.ipa`
   - נבנה דרך Codemagic (`ios-unsigned`) או סקריפט ייעודי.

3. **גרסת הגלקסי (Galaxy S22 Ultra / Android)**:
   - סנכרון עם Capacitor: `npx cap sync android`.
   - קימפול APK מקומי דרך `./build_android.sh` (Java 21).
   - תוצרי APK נשמרים ב-`/media/windows/Shared-APK/` (`C:\Shared-APK\`) תחת השמות:
     - `Homeify-Galaxy-S22-Ultra.apk`
     - `Homeify.apk`
     - `Homeify-<version>-debug.apk`
   - מוודאים שהרשאת `android:usesCleartextTraffic="true"` ו-`network_security_config.xml` נשמרות עבור חיבור ישיר ל-Tailscale (`http://100.127.161.16:8686`).

אין לסיים משימה או תיקון מבלי לוודא ששלושת הפלטפורמות עודכנו, קומפלו והתוצרים מונחים בתיקיות הייעודיות שלהן.
