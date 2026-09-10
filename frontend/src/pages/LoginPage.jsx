import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useI18nStore from '../stores/i18nStore';
import api, { getConfiguredServerUrl, setServerUrl, TAILSCALE_DEFAULT_URL } from '../api/client';
import { IconLock, IconUser, IconEye, IconEyeOff, IconShield, IconSettings, IconGlobe } from '../components/common/Icons';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Internationalization Store
  const language = useI18nStore((s) => s.language);
  const setLanguage = useI18nStore((s) => s.setLanguage);
  const t = useI18nStore((s) => s.t);
  const isHe = language === 'he';

  // Server URL settings & connection check
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState('');
  const [testStatus, setTestStatus] = useState(null); // { type: 'testing'|'success'|'error', text: '' }
  const [currentUrl, setCurrentUrl] = useState('');

  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  useEffect(() => {
    const url = getConfiguredServerUrl();
    setCurrentUrl(url);
    setServerUrlInput(url);
  }, []);

  const handleTestConnection = async (targetUrl = null) => {
    const urlToCheck = (targetUrl || serverUrlInput || currentUrl).trim().replace(/\/$/, '');
    if (!urlToCheck) return;
    setTestStatus({ type: 'testing', text: isHe ? 'בודק חיבור לשרת...' : 'Testing server connection...' });
    const start = performance.now();
    try {
      setServerUrl(urlToCheck);
      setCurrentUrl(urlToCheck);
      const res = await api.healthCheck();
      const latency = Math.round(performance.now() - start);
      setTestStatus({
        type: 'success',
        text: isHe ? `✓ מחובר לשרת בהצלחה (${latency}ms)!` : `✓ Connected successfully (${latency}ms)!`
      });
    } catch (err) {
      setTestStatus({
        type: 'error',
        text: isHe ? `✗ לא ניתן להתחבר: ${err.message}` : `✗ Cannot connect: ${err.message}`
      });
    }
  };

  const handleSaveServerUrl = () => {
    const trimmed = serverUrlInput.trim().replace(/\/$/, '');
    if (!trimmed) return;
    setServerUrl(trimmed);
    setCurrentUrl(trimmed);
    setShowServerSettings(false);
    handleTestConnection(trimmed);
  };

  const handleResetServerUrl = () => {
    setServerUrl(TAILSCALE_DEFAULT_URL);
    setCurrentUrl(TAILSCALE_DEFAULT_URL);
    setServerUrlInput(TAILSCALE_DEFAULT_URL);
    setShowServerSettings(false);
    handleTestConnection(TAILSCALE_DEFAULT_URL);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      await login(username.trim(), password);
      navigate('/');
    } catch (err) {
      console.error('Login error:', err);
      setErrorMessage(
        err.status === 401
          ? (isHe ? 'שם משתמש או סיסמה שגויים' : 'Invalid username or password')
          : (err.message || (isHe ? 'שגיאה בהתחברות למערכת. בדוק את החיבור לשרת.' : 'Failed to connect. Check server connection.'))
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page-container" style={{ direction: isHe ? 'rtl' : 'ltr' }}>
      <div className="login-card" style={{ position: 'relative' }}>
        {/* Language Switcher Pill */}
        <div style={{
          display: 'flex',
          justifyContent: isHe ? 'flex-start' : 'flex-end',
          marginBottom: 10
        }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setLanguage(isHe ? 'en' : 'he')}
            style={{
              padding: '5px 12px',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.78rem',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: 'var(--text-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              transition: 'all var(--transition-fast)'
            }}
            title={isHe ? 'Switch to English' : 'החלף לעברית'}
          >
            <IconGlobe size={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600 }}>{isHe ? 'English' : 'עברית'}</span>
          </button>
        </div>

        {/* Brand Icon & Title */}
        <div className="login-brand">
          <div className="login-brand-icon-wrapper">
            <div className="sidebar-brand-icon">
              <span className="brand-bar bar-1"></span>
              <span className="brand-bar bar-2"></span>
              <span className="brand-bar bar-3"></span>
              <span className="brand-bar bar-4"></span>
            </div>
          </div>

          {/* Explicit LTR wrapper to guarantee "Homeify" ordering without browser reversal */}
          <h1 className="login-title" dir="ltr" style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>
            <span>Home</span><span className="login-title-accent">ify</span>
          </h1>
          <p className="login-subtitle">
            {t('login.subtitle') || 'התחבר לחשבון המוזיקה האישי שלך'}
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="login-error-banner" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
            <div>⚠️ {errorMessage}</div>
            {!showServerSettings && (
              <button
                type="button"
                className="btn-text"
                style={{ fontSize: '0.78rem', color: '#1ed760', textDecoration: 'underline', padding: 0 }}
                onClick={() => setShowServerSettings(true)}
              >
                {isHe ? `בדוק או שנה כתובת שרת (${currentUrl})` : `Check or change server URL (${currentUrl})`}
              </button>
            )}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label" htmlFor="username">
              {t('login.username') || 'שם משתמש'}
            </label>
            <div className="input-with-icon">
              <span className="input-icon">
                <IconUser size={18} />
              </span>
              <input
                id="username"
                type="text"
                className="form-input"
                placeholder={t('login.usernamePlaceholder') || 'הזן שם משתמש...'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
                autoComplete="username"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              {t('login.password') || 'סיסמה'}
            </label>
            <div className="input-with-icon">
              <span className="input-icon">
                <IconLock size={18} />
              </span>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder={t('login.passwordPlaceholder') || 'הזן סיסמה...'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="btn-icon password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                title={showPassword ? (t('login.hidePassword') || 'הסתר סיסמה') : (t('login.showPassword') || 'הצג סיסמה')}
              >
                {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary login-submit-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <div className="loading-spinner" style={{ width: 18, height: 18 }} />
            ) : (
              t('login.submit') || 'התחברות למערכת'
            )}
          </button>
        </form>

        {/* Server Connection Bar */}
        <div style={{
          marginTop: '6px',
          padding: '8px 12px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '0.8rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: testStatus?.type === 'success' ? '#1ed760' : (testStatus?.type === 'error' ? '#ff6b6b' : '#3498db'),
                display: 'inline-block'
              }}></span>
              {t('login.serverTitle') || 'כתובת שרת:'}
              <strong style={{ color: '#fff', direction: 'ltr' }}>{currentUrl || TAILSCALE_DEFAULT_URL}</strong>
            </span>
            <button
              type="button"
              className="btn-icon"
              style={{ padding: 4, width: 'auto', height: 'auto', color: 'var(--text-secondary)' }}
              onClick={() => setShowServerSettings(!showServerSettings)}
              title={isHe ? 'הגדרות חיבור שרת' : 'Server Settings'}
            >
              <IconSettings size={16} />
            </button>
          </div>

          {showServerSettings && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              paddingTop: 8,
              borderTop: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              <input
                type="text"
                className="form-input"
                style={{ fontSize: '0.82rem', padding: '6px 10px', direction: 'ltr' }}
                placeholder="http://100.127.161.16:8686"
                value={serverUrlInput}
                onChange={(e) => setServerUrlInput(e.target.value)}
              />

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.78rem', padding: '5px 10px', flex: 1 }}
                  onClick={() => handleTestConnection()}
                  disabled={testStatus?.type === 'testing'}
                >
                  {t('login.testConnection') || '⚡ בדוק חיבור'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ fontSize: '0.78rem', padding: '5px 10px' }}
                  onClick={handleSaveServerUrl}
                >
                  {t('login.save') || 'שמור'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.78rem', padding: '5px 8px' }}
                  onClick={handleResetServerUrl}
                  title={isHe ? 'אפס ל-Tailscale ברירת מחדל' : 'Reset to default Tailscale'}
                >
                  {t('login.reset') || 'אפס'}
                </button>
              </div>

              {testStatus && (
                <div style={{
                  fontSize: '0.78rem',
                  padding: '6px 8px',
                  borderRadius: 4,
                  background: testStatus.type === 'success' ? 'rgba(30, 215, 96, 0.15)' : (testStatus.type === 'error' ? 'rgba(231, 76, 60, 0.15)' : 'rgba(52, 152, 219, 0.15)'),
                  color: testStatus.type === 'success' ? '#1ed760' : (testStatus.type === 'error' ? '#ff6b6b' : '#3498db'),
                }}>
                  {testStatus.text}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Security Notice */}
        <div className="login-security-notice">
          <IconShield size={16} />
          <span>
            {t('login.securityNotice') || 'הגישה מורשית למשתמשים מורשים בלבד. יצירת חשבונות חדשים ואיפוס סיסמאות מתבצעים על ידי מנהל המערכת.'}
          </span>
        </div>
      </div>
    </div>
  );
}
