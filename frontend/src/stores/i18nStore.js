import { create } from 'zustand';

const translations = {
  he: {
    // App & Nav
    'app.name': 'Homeify',
    'nav.home': 'בית',
    'nav.search': 'חיפוש',
    'nav.library': 'ספרייה',
    'nav.admin': 'ניהול',
    'nav.settings': 'הגדרות',
    'nav.quickSearch': 'חיפוש מהיר',
    'nav.login': 'התחבר',
    'nav.logout': 'התנתק',

    // Greetings
    'greeting.morning': 'בוקר טוב',
    'greeting.afternoon': 'צהריים טובים',
    'greeting.evening': 'ערב טוב',
    'greeting.night': 'לילה טוב',

    // Home Page
    'home.subtitle': 'גלה מוזיקה חדשה ושירים שלא שמעת מעולם בעברית, באנגלית ובספרדית',
    'home.refreshTooltip': 'רענן המלצות ושירים',
    'home.serverOffline': '⚠️ השרת אינו זמין. בדוק את חיבור ה-Tailscale.',
    'home.continuePlaying': 'המשך להאזין',
    'home.recentlyPlayed': 'הושמעו לאחרונה',
    'home.recentlyAdded': 'נוספו לאחרונה',
    'home.playlists': 'הפלייליסטים שלך',
    'home.topSongs': 'השירים המובילים שלך',
    'home.recommendations': 'מומלצים עבורך',
    'home.smartRecs': 'מומלץ עבורך (מבוסס על האזנות קודמות)',
    'home.smartRecsSub': 'שירים ואמנים דומים לאלו שהאזנת להם',
    'home.personalRec': 'המלצה אישית',
    'home.playAll': 'נגן הכל',
    'home.shufflePlay': 'ערבב ונגן',
    'home.songsToDiscover': 'שירים לגלות',
    'home.noSongs': 'לא נמצאו שירים כעת. נסה ללחוץ על רענון.',
    'home.refreshBtn': 'רענן המלצות',
    'home.pullToRefresh': 'משוך לרענון שירים...',
    'home.releaseToRefresh': 'שחרר לרענון!',
    'home.refreshing': 'מרענן שירים והמלצות...',

    // Categories
    'cat.all': 'גלה הכל ✨',
    'cat.hebrew': 'עברית 🇮🇱',
    'cat.english': 'אנגלית 🇺🇸',
    'cat.spanish': 'ספרדית 🇪🇸',
    'cat.fresh': 'גילויים חדשים 🔥',

    // Common Actions & Badges
    'action.play': 'נגן',
    'action.pause': 'השהה',
    'action.seeAll': 'הצג הכל',
    'action.download': 'הורד לאופליין',
    'action.downloaded': 'שמור באופליין',
    'action.more': 'אפשרויות נוספות',
    'action.close': 'סגור',
    'action.cancel': 'ביטול',
    'action.save': 'שמור',
    'action.delete': 'מחק',
    'action.edit': 'ערוך',
    'action.confirm': 'אישור',

    // Search Page
    'search.title': 'חיפוש',
    'search.placeholder': 'חפש שירים, אמנים, או הדבק קישור YouTube...',
    'search.recent': 'חיפושים אחרונים',
    'search.clearHistory': 'נקה היסטוריה',
    'search.noResults': 'לא נמצאו תוצאות עבור',
    'search.tryDifferent': 'נסה לחפש מילות מפתח אחרות או שם שיר/אמן שונה',

    // Library Page
    'library.title': 'הספרייה שלך',
    'library.songs': 'שירים',
    'library.playlists': 'פלייליסטים',
    'library.offline': 'אופליין',
    'library.favorites': 'מועדפים',
    'library.createPlaylist': 'פלייליסט חדש',
    'library.empty': 'הספרייה שלך עדיין ריקה',
    'library.emptyDesc': 'התחל להוסיף שירים מחיפוש או מדף הבית כדי לבנות את הספרייה האישית שלך',

    // Player & Modals
    'player.queue': 'תור השמעה',
    'player.lyrics': 'מילים',
    'player.visualizer': 'ויזואלייזר',
    'visualizer.bars': 'עמודות',
    'visualizer.wave': 'גל',
    'visualizer.circle': 'מעגל',
    'player.equalizer': 'אקולייזר',
    'player.sleepTimer': 'טיימר שינה',
    'player.playbackSpeed': 'מהירות השמעה',
    'player.shuffle': 'ערבוב שירים',
    'player.repeat': 'חזרה על שיר',
    'player.volume': 'עוצמת שמע',

    // Settings Page
    'settings.title': 'הגדרות מערכת',
    'settings.languageTitle': 'שפת ממשק (Interface Language)',
    'settings.languageDesc': 'בחר את שפת התצוגה של האפליקציה (שמות השירים והאמנים נשארים ללא שינוי)',
    'settings.langHebrew': 'עברית (Hebrew - ימין לשמאל)',
    'settings.langEnglish': 'English (אנגלית - Left to Right)',
    'settings.serverTitle': 'חיבור לשרת (Tailscale)',
    'settings.accountTitle': 'פרטי חשבון ואבטחה',
    'settings.appearanceTitle': 'ערכות נושא ומראה',
    'settings.playbackTitle': 'השמעה ובקרת סאונד',
    'settings.equalizerTitle': 'אקולייזר מקצועי',
    'settings.offlineTitle': 'אחסון מקומי ושירים באופליין',
    'settings.youtubeTitle': 'ייבוא פלייליסט מ-YouTube',
    'settings.backupTitle': 'גיבוי ושחזור נתונים',
    'settings.adminDashboard': 'מסך ניהול מערכת (Admin)',
    'settings.logout': 'התנתק מהחשבון',
    'settings.logoutConfirm': 'האם ברצונך להתנתק מחשבון המוזיקה שלך?',

    // Admin Page
    'admin.title': 'לוח ניהול מערכת (Admin)',
    'admin.subtitle': 'סטטיסטיקות, ניהול משתמשים, אחסון ויומני אבטחה',
  },

  en: {
    // App & Nav
    'app.name': 'Homeify',
    'nav.home': 'Home',
    'nav.search': 'Search',
    'nav.library': 'Library',
    'nav.admin': 'Admin',
    'nav.settings': 'Settings',
    'nav.quickSearch': 'Quick Search',
    'nav.login': 'Log In',
    'nav.logout': 'Log Out',

    // Greetings
    'greeting.morning': 'Good morning',
    'greeting.afternoon': 'Good afternoon',
    'greeting.evening': 'Good evening',
    'greeting.night': 'Good night',

    // Home Page
    'home.subtitle': 'Discover new music and unheard gems in Hebrew, English, and Spanish',
    'home.refreshTooltip': 'Refresh songs & recommendations',
    'home.serverOffline': '⚠️ Server offline. Check Tailscale connection.',
    'home.continuePlaying': 'Continue Playing',
    'home.recentlyPlayed': 'Recently Played',
    'home.recentlyAdded': 'Recently Added',
    'home.playlists': 'Your Playlists',
    'home.topSongs': 'Your Top Songs',
    'home.recommendations': 'Recommended for You',
    'home.smartRecs': 'Recommended for You (Based on History)',
    'home.smartRecsSub': 'Songs and artists similar to your listening history',
    'home.personalRec': 'Personal Pick',
    'home.playAll': 'Play All',
    'home.shufflePlay': 'Shuffle Play',
    'home.songsToDiscover': 'songs to discover',
    'home.noSongs': 'No songs found right now. Try refreshing.',
    'home.refreshBtn': 'Refresh Recommendations',
    'home.pullToRefresh': 'Pull down to refresh songs...',
    'home.releaseToRefresh': 'Release to refresh!',
    'home.refreshing': 'Refreshing recommendations...',

    // Categories
    'cat.all': 'Discover All ✨',
    'cat.hebrew': 'Hebrew 🇮🇱',
    'cat.english': 'English 🇺🇸',
    'cat.spanish': 'Spanish 🇪🇸',
    'cat.fresh': 'Fresh Drops 🔥',

    // Common Actions & Badges
    'action.play': 'Play',
    'action.pause': 'Pause',
    'action.seeAll': 'See all',
    'action.download': 'Download Offline',
    'action.downloaded': 'Downloaded Offline',
    'action.more': 'More Options',
    'action.close': 'Close',
    'action.cancel': 'Cancel',
    'action.save': 'Save',
    'action.delete': 'Delete',
    'action.edit': 'Edit',
    'action.confirm': 'Confirm',

    // Search Page
    'search.title': 'Search',
    'search.placeholder': 'Search songs, artists, or paste a YouTube URL...',
    'search.recent': 'Recent Searches',
    'search.clearHistory': 'Clear History',
    'search.noResults': 'No results found for',
    'search.tryDifferent': 'Try searching for different keywords or another artist/song title',

    // Library Page
    'library.title': 'Your Library',
    'library.songs': 'Songs',
    'library.playlists': 'Playlists',
    'library.offline': 'Offline',
    'library.favorites': 'Favorites',
    'library.createPlaylist': 'New Playlist',
    'library.empty': 'Your library is currently empty',
    'library.emptyDesc': 'Start adding songs from search or the home page to build your personal library',

    // Player & Modals
    'player.queue': 'Play Queue',
    'player.lyrics': 'Lyrics',
    'player.visualizer': 'Visualizer',
    'visualizer.bars': 'Bars',
    'visualizer.wave': 'Wave',
    'visualizer.circle': 'Circle',
    'player.equalizer': 'Equalizer',
    'player.sleepTimer': 'Sleep Timer',
    'player.playbackSpeed': 'Playback Speed',
    'player.shuffle': 'Shuffle Songs',
    'player.repeat': 'Repeat Song',
    'player.volume': 'Volume',

    // Settings Page
    'settings.title': 'Settings',
    'settings.languageTitle': 'Interface Language (שפת ממשק)',
    'settings.languageDesc': 'Choose application display language (song titles and artist names remain unchanged)',
    'settings.langHebrew': 'עברית (Hebrew - Right to Left)',
    'settings.langEnglish': 'English (Left to Right)',
    'settings.serverTitle': 'Server Connection (Tailscale)',
    'settings.accountTitle': 'Account & Security',
    'settings.appearanceTitle': 'Appearance & Themes',
    'settings.playbackTitle': 'Playback & Audio Controls',
    'settings.equalizerTitle': 'Pro Equalizer',
    'settings.offlineTitle': 'Offline Storage & Downloads',
    'settings.youtubeTitle': 'Import YouTube Playlist',
    'settings.backupTitle': 'Backup & Restore Data',
    'settings.adminDashboard': 'Admin Dashboard',
    'settings.logout': 'Log Out',
    'settings.logoutConfirm': 'Are you sure you want to log out of your account?',

    // Admin Page
    'admin.title': 'Admin Dashboard',
    'admin.subtitle': 'System statistics, user management, storage, and security logs',
  },
};

function applyHtmlDirection(lang) {
  const isRtl = lang === 'he';
  const dir = isRtl ? 'rtl' : 'ltr';
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', lang);
    document.body.classList.toggle('rtl-mode', isRtl);
    document.body.classList.toggle('ltr-mode', !isRtl);
  }
}

const initialLang = (() => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('homeify_language');
    if (saved === 'he' || saved === 'en') {
      applyHtmlDirection(saved);
      return saved;
    }
  }
  // Default to Hebrew per user request
  applyHtmlDirection('he');
  return 'he';
})();

const useI18nStore = create((set, get) => ({
  language: initialLang,

  setLanguage: (lang) => {
    const validLang = lang === 'en' ? 'en' : 'he';
    localStorage.setItem('homeify_language', validLang);
    applyHtmlDirection(validLang);
    set({ language: validLang });
  },

  isRtl: () => get().language === 'he',

  t: (key, fallback = '') => {
    const lang = get().language || 'he';
    const dict = translations[lang] || translations.he;
    return dict[key] || translations.he[key] || fallback || key;
  },
}));

export { useI18nStore };
export default useI18nStore;
