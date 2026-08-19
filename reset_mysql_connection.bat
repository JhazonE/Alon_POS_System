@echo off
echo Connecting to MySQL in safe mode and resetting root password
echo ============================================================

echo.
echo This will reset the root password to blank.
echo If you want a different password, edit this script.

"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql" -u root -e "
USE mysql;
ALTER USER 'root'@'localhost' IDENTIFIED BY '';
FLUSH PRIVILEGES;
CREATE DATABASE IF NOT EXISTS alon_pos;
CREATE USER IF NOT EXISTS 'alon_pos'@'localhost' IDENTIFIED BY 'stock2025';
GRANT ALL PRIVILEGES ON alon_pos.* TO 'alon_pos'@'localhost';
FLUSH PRIVILEGES;
SELECT User, Host FROM mysql.user WHERE User IN ('root', 'alon_pos');
"

if %errorlevel% neq 0 (
    echo Failed to connect. Make sure MySQL is running in safe mode in the other window.
    pause
    exit /b 1
)

echo.
echo Root password reset successfully!
echo alon_pos user created.
echo You can now close the safe mode window (Ctrl+C) and run the normal setup.

pause
