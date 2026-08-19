@echo off
echo Establishing MySQL Connection for alon_pos
echo =============================================

echo.
echo Step 1: Checking MySQL service status...
net start | findstr /C:"MySQL" >nul 2>&1
if %errorlevel% neq 0 (
    echo MySQL service is not running. Starting...
    net start mysql80 >nul 2>&1
    if %errorlevel% neq 0 (
        echo Failed to start MySQL service. Please start it manually or run as Administrator.
        pause
        exit /b 1
    )
) else (
    echo MySQL service is running.
)

echo.
echo Step 2: Creating database and user...
echo Please enter your MySQL root password when prompted.
echo If you forgot your password, you'll need to reset it first.

"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql" -u root -p -e "
CREATE DATABASE IF NOT EXISTS alon_pos;
CREATE USER IF NOT EXISTS 'alon_pos'@'localhost' IDENTIFIED BY 'stock2025';
GRANT ALL PRIVILEGES ON alon_pos.* TO 'alon_pos'@'localhost';
FLUSH PRIVILEGES;
SHOW DATABASES;
SELECT User, Host FROM mysql.user WHERE User = 'alon_pos';"

if %errorlevel% neq 0 (
    echo Failed to create user. Trying safe mode approach...
    echo.
    echo Starting MySQL in safe mode for setup...

    net stop mysql80 >nul 2>&1

    start "MySQL Safe Mode" cmd /c ""C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld" --skip-grant-tables --console"

    timeout /t 5 /nobreak >nul

    echo Connecting in safe mode...
    "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql" -u root --socket=mysql -e "
    USE mysql;
    ALTER USER 'root'@'localhost' IDENTIFIED BY '';
    FLUSH PRIVILEGES;
    CREATE DATABASE IF NOT EXISTS alon_pos;
    CREATE USER IF NOT EXISTS 'alon_pos'@'localhost' IDENTIFIED BY 'stock2025';
    GRANT ALL PRIVILEGES ON alon_pos.* TO 'alon_pos'@'localhost';
    FLUSH PRIVILEGES;" 2>nul

    echo Stopping safe mode connections...
    taskkill /F /IM mysqld.exe /T >nul 2>&1

    echo Restarting MySQL service...
    net start mysql80 >nul 2>&1
)

echo.
echo Step 3: Testing database connection...

npm run seed

if %errorlevel% equ 0 (
    echo.
    echo ✅ MySQL connection established successfully!
    echo You can now run: npm run dev
) else (
    echo.
    echo ❌ Seed script failed. Connection may not be fully established.
    echo Please check your MySQL setup and try again.
)

pause
