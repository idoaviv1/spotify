> [!important] הקוד של הפרויקט הועבר — 2026-09-10
> העץ הזה חי עכשיו על הדיסק המשותף `/srv/homelab/code/…`, והנתיב הישן הוא **symlink** אליו.
> תמשיך להשתמש בנתיב הישן כרגיל — git, venv, pnpm והכול עובד כרגיל.
> **אל תחליף symlink בתיקייה אמיתית, ואל תשחזר `*.premigration` מעל symlink.**
> אם נתיב נראה שבור, הדיסק המשותף פשוט לא מחובר: `sudo systemctl start homelab-disk`.
> את השירותים מפעילים רק דרך systemd, לא ידנית.
> ההסבר המלא: `/srv/homelab/docs/AGENTS-READ-THIS.md`

# Homeify Development Guidelines

## Multi-Platform Synchronization Rule (מחייב)
כל תקלה, באג, עדכון עיצובי או תכונה חדשה בפרויקט זה — **חובה ליישם ולסנכרן בקוד בכל 3 הגרסאות במקביל**:
1. **Web (אתר / שרת)**: נבנה ל-`frontend/dist`, שירות `soniclink.service` מאותחל.
2. **iPhone (iOS)**: קוד מסונכרן ל-Capacitor iOS (`npx cap sync ios`). **חשוב**: אין לבצע בילד פיזי לקובץ IPA ב-Codemagic אלא אם המשתמש ביקש זאת במפורש!
3. **Galaxy S22 Ultra (Android)**: מסונכרן ל-Capacitor Android, קובץ APK נבנה ומעודכן דרך `./build_android.sh` ב-`C:\Shared-APK\homeify\` (`/media/windows/Shared-APK/homeify/`).

- שרת Tailscale של הפרויקט: `http://100.127.161.16:8686`.
- יש לוודא תמיד ש-`network_security_config.xml` ו-`usesCleartextTraffic="true"` מוגדרים עבור אנדרואיד.