import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import { IconLock, IconUser, IconEye, IconEyeOff, IconShield } from '../components/common/Icons';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage('נא למלא שם משתמש וסיסמה');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    const res = await login(username.trim(), password);
    setIsSubmitting(false);

    if (res.success) {
      navigate('/', { replace: true });
    } else {
      setErrorMessage(res.error || 'שם משתמש או סיסמה שגויים');
    }
  };

  return (
    <div className="login-page-container">
      <div className="login-card">
        {/* Brand Icon & Title */}
        <div className="login-brand">
          <div className="login-brand-icon-wrapper">
            <div className="sidebar-brand-icon" style={{ width: 32, height: 32 }}>
              <span className="brand-bar bar-1"></span>
              <span className="brand-bar bar-2"></span>
              <span className="brand-bar bar-3"></span>
              <span className="brand-bar bar-4"></span>
            </div>
          </div>
          <h1 className="login-title">
            Home<span className="login-title-accent">ify</span>
          </h1>
          <p className="login-subtitle">התחבר לחשבון המוזיקה האישי שלך</p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="login-error-banner">
            <span>⚠️ {errorMessage}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label" htmlFor="username">שם משתמש</label>
            <div className="input-with-icon">
              <span className="input-icon">
                <IconUser size={18} />
              </span>
              <input
                id="username"
                type="text"
                className="form-input"
                placeholder="הזן שם משתמש..."
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
            <label className="form-label" htmlFor="password">סיסמה</label>
            <div className="input-with-icon">
              <span className="input-icon">
                <IconLock size={18} />
              </span>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="הזן סיסמה..."
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
                title={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
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
              'התחברות למערכת'
            )}
          </button>
        </form>

        {/* Security Notice */}
        <div className="login-security-notice">
          <IconShield size={16} />
          <span>
            הגישה מורשית למשתמשים מורשים בלבד. יצירת חשבונות חדשים ואיפוס סיסמאות מתבצעים על ידי מנהל המערכת.
          </span>
        </div>
      </div>
    </div>
  );
}
