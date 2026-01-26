import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const loginSchema = z.object({
  email: z.string().email('Невірний формат email'),
  password: z.string().min(1, 'Пароль обов\'язковий'),
});

const signUpSchema = z.object({
  email: z.string().email('Невірний формат email'),
  password: z.string().min(6, 'Пароль має бути мінімум 6 символів'),
  passwordConfirm: z.string().min(1, 'Підтвердження пароля обов\'язкове'),
  parentName: z.string().min(1, 'ФІО батька обов\'язкове'),
  childName: z.string().min(1, 'ФІО дитини обов\'язкове'),
}).refine((data) => data.password === data.passwordConfirm, {
  message: 'Паролі не співпадають',
  path: ['passwordConfirm'],
});

type LoginFormData = z.infer<typeof loginSchema>;
type SignUpFormData = z.infer<typeof signUpSchema>;

export default function Login() {
  const { user, role, isLoading, signInWithPassword, signUp } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const signUpForm = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: '',
      password: '',
      passwordConfirm: '',
      parentName: '',
      childName: '',
    },
  });

  useEffect(() => {
    if (!isLoading && user) {
      // Проверяем статус пользователя через profile (будет загружен через AuthContext)
      // Если is_active = false, редирект на /pending произойдет через ProtectedRoute
      if (role === 'parent') {
        navigate('/parent', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    }
  }, [isLoading, user, role, navigate]);

  const onLoginSubmit = async (data: LoginFormData) => {
    setIsSubmitting(true);
    try {
      await signInWithPassword(data.email, data.password);
      // Редирект произойдет автоматически через useEffect выше
    } catch (error) {
      // Ошибка уже обработана в signInWithPassword
      console.error('[Login] Login error', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSignUpSubmit = async (data: SignUpFormData) => {
    setIsSubmitting(true);
    try {
      await signUp(data.email, data.password, data.parentName, data.childName);
      // После успешной регистрации ждем немного, чтобы профиль создался, затем редирект
      setTimeout(() => {
        navigate('/pending', { replace: true });
      }, 1000);
    } catch (error) {
      // Ошибка уже обработана в signUp
      console.error('[Login] Sign up error', error);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-soft">
        <h1 className="text-xl font-semibold mb-2">Авторизація</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Увійдіть або зареєструйтеся, щоб продовжити.
        </p>
        
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'login' | 'signup')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Вхід</TabsTrigger>
            <TabsTrigger value="signup">Реєстрація</TabsTrigger>
          </TabsList>
          
          <TabsContent value="login" className="space-y-4 mt-4">
            <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="email@example.com"
                  {...loginForm.register('email')}
                  disabled={isSubmitting || isLoading}
                />
                {loginForm.formState.errors.email && (
                  <p className="text-sm text-destructive">
                    {loginForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="login-password">Пароль</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  {...loginForm.register('password')}
                  disabled={isSubmitting || isLoading}
                />
                {loginForm.formState.errors.password && (
                  <p className="text-sm text-destructive">
                    {loginForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              
              <Button 
                type="submit" 
                className="w-full"
                disabled={isSubmitting || isLoading}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Вхід...
                  </>
                ) : (
                  'Увійти'
                )}
              </Button>
            </form>
          </TabsContent>
          
          <TabsContent value="signup" className="space-y-4 mt-4">
            <form onSubmit={signUpForm.handleSubmit(onSignUpSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="email@example.com"
                  {...signUpForm.register('email')}
                  disabled={isSubmitting || isLoading}
                />
                {signUpForm.formState.errors.email && (
                  <p className="text-sm text-destructive">
                    {signUpForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="signup-password">Пароль</Label>
                <Input
                  id="signup-password"
                  type="password"
                  placeholder="Мінімум 6 символів"
                  {...signUpForm.register('password')}
                  disabled={isSubmitting || isLoading}
                />
                {signUpForm.formState.errors.password && (
                  <p className="text-sm text-destructive">
                    {signUpForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="signup-password-confirm">Підтвердження пароля</Label>
                <Input
                  id="signup-password-confirm"
                  type="password"
                  placeholder="Повторіть пароль"
                  {...signUpForm.register('passwordConfirm')}
                  disabled={isSubmitting || isLoading}
                />
                {signUpForm.formState.errors.passwordConfirm && (
                  <p className="text-sm text-destructive">
                    {signUpForm.formState.errors.passwordConfirm.message}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="signup-parent-name">ФІО батька</Label>
                <Input
                  id="signup-parent-name"
                  type="text"
                  placeholder="Повне ім'я батька"
                  {...signUpForm.register('parentName')}
                  disabled={isSubmitting || isLoading}
                />
                {signUpForm.formState.errors.parentName && (
                  <p className="text-sm text-destructive">
                    {signUpForm.formState.errors.parentName.message}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="signup-child-name">ФІО дитини</Label>
                <Input
                  id="signup-child-name"
                  type="text"
                  placeholder="Повне ім'я дитини"
                  {...signUpForm.register('childName')}
                  disabled={isSubmitting || isLoading}
                />
                {signUpForm.formState.errors.childName && (
                  <p className="text-sm text-destructive">
                    {signUpForm.formState.errors.childName.message}
                  </p>
                )}
              </div>
              
              <Button 
                type="submit" 
                className="w-full"
                disabled={isSubmitting || isLoading}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Реєстрація...
                  </>
                ) : (
                  'Зареєструватися'
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
