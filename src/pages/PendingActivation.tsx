export default function PendingActivation() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-soft text-center">
        <div className="flex justify-center mb-6">
          <img 
            src="/logoiris.png" 
            alt="Логотип Ірис" 
            className="h-24 w-auto"
          />
        </div>
        
        <h1 className="text-2xl font-semibold mb-4">
          Ви зареєструвались у WEB системі дитячого садочку Ірис
        </h1>
        
        <div className="space-y-3 text-muted-foreground">
          <p>
            Для підтвердження реєстрації Вам надіслано лист на вказаний Вами e-mail.
          </p>
          <p>
            Перевірте Вашу скриньку і підтвердіть реєстрацію.
          </p>
        </div>
      </div>
    </div>
  );
}
