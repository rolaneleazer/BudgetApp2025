import { useState } from 'react';
import { supabase } from './supabaseClient';

const C = {
  bg: '#0d1117',
  card: '#161b22',
  border: '#21262d',
  text: '#e6edf3',
  muted: '#7d8590',
  green: '#3fb950',
  red: '#f85149',
  blue: '#388bfd',
  amber: '#d29922'
};

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });

  const isConfigured = 
    import.meta.env.VITE_SUPABASE_URL && 
    !import.meta.env.VITE_SUPABASE_URL.includes('your-supabase-project') &&
    import.meta.env.VITE_SUPABASE_ANON_KEY &&
    !import.meta.env.VITE_SUPABASE_ANON_KEY.includes('your-supabase-anon-key');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isConfigured) {
      setMessage({ text: 'Please configure your .env file with valid Supabase credentials first.', type: 'error' });
      return;
    }
    if (!email || !password) {
      setMessage({ text: 'Please fill in all fields.', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
          },
        });
        if (error) throw error;
        
        // Supabase sometimes requires email verification depending on settings
        if (data?.user && data?.session === null) {
          setMessage({ text: 'Account created! Please check your email inbox to confirm registration.', type: 'success' });
        } else {
          setMessage({ text: 'Sign up successful! Logging you in...', type: 'success' });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err) {
      setMessage({ text: err.message || 'An error occurred during authentication.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: C.bg,
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: C.text,
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: '16px',
        padding: '32px 28px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px'
      }}>
        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            fontSize: '32px',
            fontWeight: 800,
            color: C.green,
            margin: '0 0 8px 0',
            letterSpacing: '-0.02em',
            background: `linear-gradient(135deg, ${C.green} 0%, #a2ffb3 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Bujdet
          </h1>
          <p style={{
            fontSize: '14px',
            color: C.muted,
            margin: 0
          }}>
            {isSignUp ? 'Create a secure cloud account' : 'Sign in to access your budget from any device'}
          </p>
        </div>

        {/* Configuration Warning */}
        {!isConfigured && (
          <div style={{
            background: 'rgba(210, 153, 34, 0.1)',
            border: `1px solid ${C.amber}44`,
            borderRadius: '10px',
            padding: '12px 14px',
            fontSize: '13px',
            color: C.amber,
            lineHeight: 1.4
          }}>
            <strong>⚠️ Credentials Needed:</strong><br />
            Create a file named <code>.env</code> in the root of the project with your Supabase URL & Anon Key, then restart the dev server.
          </div>
        )}

        {/* Message Banner */}
        {message.text && (
          <div style={{
            background: message.type === 'error' ? 'rgba(248, 81, 73, 0.1)' : 'rgba(63, 185, 80, 0.1)',
            border: `1px solid ${message.type === 'error' ? C.red : C.green}44`,
            borderRadius: '8px',
            padding: '10px 12px',
            fontSize: '13px',
            color: message.type === 'error' ? C.red : C.green,
            lineHeight: 1.4
          }}>
            {message.text}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="auth-email" style={{ fontSize: '12px', fontWeight: 600, color: C.muted }}>Email Address</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              disabled={loading}
              required
              style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: '8px',
                padding: '12px 14px',
                color: C.text,
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
                width: '100%'
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="auth-password" style={{ fontSize: '12px', fontWeight: 600, color: C.muted }}>Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              required
              minLength={6}
              style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: '8px',
                padding: '12px 14px',
                color: C.text,
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
                width: '100%'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px 20px',
              borderRadius: '8px',
              border: `1px solid ${C.green}`,
              background: 'rgba(63, 185, 80, 0.15)',
              color: C.green,
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: 700,
              marginTop: '8px',
              transition: 'background-color 0.2s, opacity 0.2s',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Processing...' : isSignUp ? 'Create Cloud Account' : 'Sign In'}
          </button>
        </form>

        {/* Footer switch */}
        <div style={{
          textAlign: 'center',
          fontSize: '13px',
          color: C.muted,
          borderTop: `1px solid ${C.border}44`,
          paddingTop: '16px',
          marginTop: '8px'
        }}>
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setMessage({ text: '', type: '' });
            }}
            style={{
              background: 'none',
              border: 'none',
              color: C.blue,
              cursor: 'pointer',
              fontWeight: 600,
              padding: 0,
              fontSize: '13px',
              textDecoration: 'underline'
            }}
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </div>
      </div>
    </div>
  );
}
