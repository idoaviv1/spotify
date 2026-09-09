# Homeify Development Guidelines

## Multi-Platform Synchronization Rule (מחייב)
כל תקלה, באג, עדכון עיצובי או תכונה חדשה בפרויקט זה — **חובה ליישם, לסנכרן ולבנות אוטומטית בכל 3 הגרסאות במקביל**:
1. **Web (אתר / שרת)**: נבנה ל-`frontend/dist`, שירות `soniclink.service` מאותחל.
2. **iPhone (iOS)**: מסונכרן ל-Capacitor iOS, קובץ IPA נשמר ב-`C:\Shared-IPA\` (`/media/windows/Shared-IPA/`).
3. **Galaxy S22 Ultra (Android)**: מסונכרן ל-Capacitor Android, קובץ APK נבנה ומעודכן דרך `./build_android.sh` ב-`C:\Shared-APK\` (`/media/windows/Shared-APK/`).

- שרת Tailscale של הפרויקט: `http://100.127.161.16:8686`.
- יש לוודא תמיד ש-`network_security_config.xml` ו-`usesCleartextTraffic="true"` מוגדרים עבור אנדרואיד.
