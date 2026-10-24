@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo =============================================
echo   班级选座系统 - 本地版构建工具
echo =============================================
echo.

echo [1/3] 安装依赖 ^& 构建 Backend...
cd backend
pip install pyinstaller -q
pip install -r requirements.txt -q
pyinstaller --clean --noconfirm pyinstaller.spec
cd ..

echo [2/3] 组装发布包...
set DIST=dist\ClassSeatChoose-local
if exist "%DIST%" rmdir /s /q "%DIST%"
mkdir "%DIST%" 2>nul

xcopy /E /I /Q "backend\dist\backend_dist" "%DIST%\backend\"
xcopy /E /I /Q "frontend" "%DIST%\frontend\"

echo [3/3] 生成 start.bat...
(
echo @echo off
echo chcp 65001 ^>nul
echo cd /d "%%~dp0"
echo set REDIS_URL=
echo set SERVE_STATIC=true
echo set CORS_ORIGINS=http://localhost:8481
echo set COOKIE_SECURE=false
echo set TEACHER_INIT_TOKEN=admin123
echo set API_RATE_LIMIT=999999
echo set UPLOAD_RATE_LIMIT=999999
echo set LOGIN_MAX_ATTEMPTS=999999
echo title 班级选座系统
echo.
echo echo 正在启动服务...
echo start "Seat-Backend" /MIN "%%~dp0backend\backend.exe"
echo.
echo :wait
echo timeout /t 1 /nobreak ^>nul
echo powershell -Command "try { $r=Invoke-WebRequest -Uri 'http://127.0.0.1:8481/api/health' -TimeoutSec 2 -UseBasicParsing; exit 0 } catch { exit 1 }" ^>nul 2^>^&1
echo if errorlevel 1 goto wait
echo.
echo start http://localhost:8481/login.html
echo.
echo echo ========================================
echo echo   系统已启动！
echo echo   http://localhost:8481/login.html
echo echo   关闭本窗口停止服务
echo echo ========================================
echo pause ^>nul
echo.
echo taskkill /F /FI "WINDOWTITLE eq Seat-*" ^>nul 2^>^&1
) > "%DIST%\start.bat"

echo.
echo =============================================
echo   构建完成！
echo   输出目录: %DIST%\
echo   压缩 %DIST% 文件夹即可分发
echo =============================================
pause