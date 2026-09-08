/**
 * Haptic Feedback utility for Homeify.
 * Uses Web Vibration API and Capacitor Haptics with safe fallbacks.
 */

export function triggerHaptic(type = 'light') {
  if (typeof window === 'undefined') return;

  try {
    // 1. If Capacitor Haptics is available on native iOS/Android
    if (window.Capacitor && window.Capacitor.isPluginAvailable && window.Capacitor.isPluginAvailable('Haptics')) {
      const Haptics = window.Capacitor.Plugins.Haptics;
      if (type === 'selection') {
        Haptics.selectionChanged();
      } else if (type === 'medium') {
        Haptics.impact({ style: 'Medium' });
      } else if (type === 'heavy') {
        Haptics.impact({ style: 'Heavy' });
      } else if (type === 'success') {
        Haptics.notification({ type: 'SUCCESS' });
      } else {
        Haptics.impact({ style: 'Light' });
      }
      return;
    }

    // 2. Fallback to standard Web Vibration API
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      if (type === 'light' || type === 'selection') {
        navigator.vibrate(12);
      } else if (type === 'medium') {
        navigator.vibrate(25);
      } else if (type === 'heavy') {
        navigator.vibrate(40);
      } else if (type === 'success') {
        navigator.vibrate([15, 40, 20]);
      }
    }
  } catch {
    // Silently ignore if vibrations are not permitted by user or device
  }
}
