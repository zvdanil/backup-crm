import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { Chrome, Apple } from 'lucide-react';

export default function Login() {
  const { user, role, isLoading, signInWithProvider } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && user) {
      navigate(role === 'parent' ? '/parent' : '/', { replace: true });
    }
  }, [isLoading, user, role, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-soft">
        <h1 className="text-xl font-semibold mb-2">Вхід</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Увійдіть через Google або Apple, щоб продовжити.
        </p>
        <div className="space-y-3">
          <Button className="w-full" onClick={() => signInWithProvider('google')}>
            <Chrome className="h-4 w-4 mr-2" />
            Увійти через Google
          </Button>
          <Button variant="outline" className="w-full" onClick={() => signInWithProvider('apple')}>
            <Apple className="h-4 w-4 mr-2" />
            Увійти через Apple
          </Button>
        </div>
      </div>
    </div>
  );
}
