import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { Chrome, Apple, Loader2 } from 'lucide-react';

export default function Login() {
  const { user, role, isLoading, signInWithProvider } = useAuth();
  const navigate = useNavigate();
  const [signingIn, setSigningIn] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && user) {
      navigate(role === 'parent' ? '/parent' : '/', { replace: true });
    }
  }, [isLoading, user, role, navigate]);

  const handleSignIn = async (provider: 'google' | 'apple') => {
    console.log('[Login] Button clicked', { provider });
    setSigningIn(provider);
    try {
      await signInWithProvider(provider);
      // OAuth должен редиректить, но если этого не происходит через 3 секунды, сбрасываем состояние
      setTimeout(() => {
        if (signingIn === provider) {
          console.warn('[Login] OAuth redirect did not happen, resetting state');
          setSigningIn(null);
        }
      }, 3000);
    } catch (error) {
      console.error('[Login] Error during sign in', error);
      setSigningIn(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-soft">
        <h1 className="text-xl font-semibold mb-2">Вхід</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Увійдіть через Google або Apple, щоб продовжити.
        </p>
        <div className="space-y-3">
          <Button 
            className="w-full" 
            onClick={() => handleSignIn('google')}
            disabled={signingIn !== null || isLoading}
          >
            {signingIn === 'google' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Chrome className="h-4 w-4 mr-2" />
            )}
            {signingIn === 'google' ? 'Перенаправлення...' : 'Увійти через Google'}
          </Button>
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={() => handleSignIn('apple')}
            disabled={signingIn !== null || isLoading}
          >
            {signingIn === 'apple' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Apple className="h-4 w-4 mr-2" />
            )}
            {signingIn === 'apple' ? 'Перенаправлення...' : 'Увійти через Apple'}
          </Button>
        </div>
        {signingIn && (
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Відкривається сторінка авторизації {signingIn === 'google' ? 'Google' : 'Apple'}...
          </p>
        )}
      </div>
    </div>
  );
}
