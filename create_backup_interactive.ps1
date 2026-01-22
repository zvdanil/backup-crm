# Интерактивный скрипт для создания бэкапа базы данных Supabase
# Работает на бесплатном плане (без автоматических бэкапов)

$projectRef = "qtphickigswerhvintvh"
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupFile = "backup_$timestamp.sql"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Создание бэкапа базы данных Supabase" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Проект: $projectRef" -ForegroundColor Yellow
Write-Host "Файл бэкапа: $backupFile" -ForegroundColor Yellow
Write-Host ""

# Запрашиваем пароль базы данных
Write-Host "Для создания бэкапа нужен пароль базы данных." -ForegroundColor White
Write-Host "Где его найти:" -ForegroundColor White
Write-Host "  1. Откройте: https://app.supabase.com/project/$projectRef/settings/database" -ForegroundColor Gray
Write-Host "  2. Найдите раздел Connection string или Database password" -ForegroundColor Gray
Write-Host "  3. Если пароль забыт, нажмите Reset database password" -ForegroundColor Gray
Write-Host ""

$securePassword = Read-Host "Введите пароль базы данных" -AsSecureString
$password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
)

if ([string]::IsNullOrWhiteSpace($password)) {
    Write-Host ""
    Write-Host "Пароль не может быть пустым!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Создание бэкапа..." -ForegroundColor Yellow

# Формируем connection string
# Используем pooler для более стабильного подключения
$dbUrl = "postgresql://postgres.$projectRef" + ":" + $password + "@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"

try {
    # Пробуем создать бэкап через Supabase CLI
    Write-Host "Попытка 1: Использование Supabase CLI..." -ForegroundColor Cyan
    
    $result = npx supabase db dump --db-url $dbUrl --file $backupFile 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "Бэкап успешно создан через Supabase CLI!" -ForegroundColor Green
        Write-Host "Файл: $backupFile" -ForegroundColor Cyan
        $fileSize = (Get-Item $backupFile).Length / 1MB
        Write-Host "Размер: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Cyan
        Write-Host ""
        exit 0
    } else {
        Write-Host ""
        Write-Host "Supabase CLI требует Docker. Пробуем альтернативный способ..." -ForegroundColor Yellow
        Write-Host ""
    }
} catch {
    Write-Host ""
    Write-Host "Ошибка с Supabase CLI: $_" -ForegroundColor Yellow
    Write-Host ""
}

# Альтернативный способ: через pg_dump (если установлен PostgreSQL)
Write-Host "Попытка 2: Использование pg_dump (если установлен PostgreSQL)..." -ForegroundColor Cyan

$pgDumpPath = Get-Command pg_dump -ErrorAction SilentlyContinue
if ($pgDumpPath) {
    try {
        $env:PGPASSWORD = $password
        $host = "aws-0-eu-west-1.pooler.supabase.com"
        $port = "6543"
        $user = "postgres.$projectRef"
        $database = "postgres"
        
        pg_dump -h $host -p $port -U $user -d $database -f $backupFile --no-owner --no-acl
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "Бэкап успешно создан через pg_dump!" -ForegroundColor Green
            Write-Host "Файл: $backupFile" -ForegroundColor Cyan
            $fileSize = (Get-Item $backupFile).Length / 1MB
            Write-Host "Размер: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Cyan
            Write-Host ""
            Remove-Item Env:\PGPASSWORD
            exit 0
        }
    } catch {
        Write-Host ""
        Write-Host "Ошибка с pg_dump: $_" -ForegroundColor Yellow
        Write-Host ""
    } finally {
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    }
} else {
    Write-Host ""
    Write-Host "pg_dump не найден. PostgreSQL не установлен или не в PATH." -ForegroundColor Yellow
    Write-Host ""
}

# Если оба способа не сработали
Write-Host ""
Write-Host "Не удалось создать бэкап автоматически." -ForegroundColor Red
Write-Host ""
Write-Host "Альтернативные способы:" -ForegroundColor Yellow
Write-Host "1. Установите Docker Desktop и повторите попытку" -ForegroundColor Cyan
Write-Host "2. Установите PostgreSQL и используйте pg_dump напрямую" -ForegroundColor Cyan
Write-Host "3. Используйте онлайн инструменты для подключения к БД" -ForegroundColor Cyan
Write-Host ""
Write-Host "Или создайте бэкап вручную через SQL запросы" -ForegroundColor Yellow
Write-Host "См. файл BACKUP_INSTRUCTIONS.md для инструкций" -ForegroundColor Yellow

exit 1
