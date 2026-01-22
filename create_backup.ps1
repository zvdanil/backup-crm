# Скрипт для создания бэкапа базы данных Supabase
# Требуется: пароль базы данных из Supabase Dashboard

param(
    [Parameter(Mandatory=$true)]
    [string]$DatabasePassword
)

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupFile = "backup_$timestamp.sql"
$projectRef = "qtphickigswerhvintvh"

Write-Host "Создание бэкапа базы данных..." -ForegroundColor Green
Write-Host "Проект: $projectRef" -ForegroundColor Cyan
Write-Host "Файл бэкапа: $backupFile" -ForegroundColor Cyan

# Получаем connection string
# Формат: postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
$dbUrl = "postgresql://postgres.$projectRef`:$DatabasePassword@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"

try {
    # Создаем бэкап через Supabase CLI
    Write-Host "`nВыполняется создание бэкапа..." -ForegroundColor Yellow
    
    npx supabase db dump --db-url $dbUrl --file $backupFile
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ Бэкап успешно создан: $backupFile" -ForegroundColor Green
        Write-Host "Размер файла: $((Get-Item $backupFile).Length / 1MB) MB" -ForegroundColor Cyan
    } else {
        Write-Host "`n❌ Ошибка при создании бэкапа" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "`n❌ Ошибка: $_" -ForegroundColor Red
    Write-Host "`nАльтернативный способ:" -ForegroundColor Yellow
    Write-Host "1. Откройте Supabase Dashboard" -ForegroundColor Cyan
    Write-Host "2. Перейдите в Settings → Database" -ForegroundColor Cyan
    Write-Host "3. Нажмите 'Create backup' или используйте раздел 'Backups'" -ForegroundColor Cyan
    exit 1
}
