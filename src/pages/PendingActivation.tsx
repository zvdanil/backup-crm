import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function PendingActivation() {
  const { user, profile, role } = useAuth();
  const navigate = useNavigate();

  // Если пользователь активен - редирект на главную
  useEffect(() => {
    if (user && profile && profile.is_active && role !== 'newregistration') {
      navigate(role === 'parent' ? '/parent' : '/', { replace: true });
    }
  }, [user, profile, role, navigate]);

  // Если пользователь авторизован и email подтвержден
  const isEmailConfirmed = user?.email_confirmed_at != null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-soft text-center">
        <div className="flex justify-center mb-6">
          <img src="/logoiris.png" alt="Логотип Ірис" className="h-24 w-auto" />
        </div>

        {isEmailConfirmed ? (
          // Email подтвержден - ждем активации администратором
          <>
            <h1 className="text-2xl font-semibold mb-4">Email підтверджено</h1>
            <div className="space-y-3 text-muted-foreground mb-6">
              <p>
                Ваша реєстрація в WEB системі дитячого садочку Ірис успішно
                підтверджена.
              </p>
              <p className="font-medium text-foreground">
                Очікуйте активації вашого акаунта адміністратором.
              </p>
              <p className="text-sm">
                Після активації Ви зможете увійти в систему та користуватися
                всіма доступними функціями.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate("/login")}
              className="w-full"
            >
              Повернутися на сторінку входу
            </Button>
          </>
        ) : (
          // Email еще не подтвержден
          <>
            <h1 className="text-2xl font-semibold mb-4">
              Ви зареєструвались у WEB системі дитячого садочку Ірис
            </h1>
            <div className="space-y-3 text-muted-foreground">
              <p>
                Для підтвердження реєстрації Вам надіслано лист на вказаний Вами
                e-mail.
              </p>
              <p>Перевірте Вашу скриньку і підтвердіть реєстрацію.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
