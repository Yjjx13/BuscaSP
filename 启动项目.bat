@echo off
setlocal EnableExtensions
chcp 65001 >nul

set "ROOT=%~dp0"
set "API_LOG=%ROOT%tmp\api.log"
set "ADMIN_LOG=%ROOT%tmp\admin.log"

echo.
echo ========================================
echo          BuscaSP 正在启动
echo ========================================

where docker >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Docker Desktop。请先启动 Docker Desktop 后再试。
  pause
  exit /b 1
)

if not exist "%ROOT%node_modules" (
  echo [错误] 未找到项目依赖，请先完成项目依赖安装。
  pause
  exit /b 1
)

if not exist "%ROOT%tmp" mkdir "%ROOT%tmp"

echo [1/3] 启动数据库和缓存...
docker compose -f "%ROOT%infra\docker-compose.yml" up -d
if errorlevel 1 (
  echo [错误] Docker 服务启动失败，请确认 Docker Desktop 已完全启动。
  pause
  exit /b 1
)

set "TSX="
for /d %%D in ("%ROOT%node_modules\.pnpm\tsx@*") do if not defined TSX set "TSX=%%D\node_modules\tsx\dist\cli.mjs"
set "VITE="
for /d %%D in ("%ROOT%node_modules\.pnpm\vite@*") do if not defined VITE set "VITE=%%D\node_modules\vite\bin\vite.js"

if not defined TSX (
  echo [错误] 未找到 API 运行组件。
  pause
  exit /b 1
)
if not defined VITE (
  echo [错误] 未找到后台运行组件。
  pause
  exit /b 1
)

echo [2/3] 检查 API 服务...
netstat -ano | findstr /C:":3000 " >nul
if errorlevel 1 (
  start "BuscaSP API" /min cmd /c "cd /d "%ROOT%apps\api" ^&^& node "%TSX%" watch src\server.ts ^> "%API_LOG%" 2^>^&1"
  echo       API 正在启动：127.0.0.1:3000
) else (
  echo       API 已在运行：127.0.0.1:3000
)

echo [3/3] 检查管理后台...
netstat -ano | findstr /C:":5173 " >nul
if errorlevel 1 (
  start "BuscaSP Admin" /min cmd /c "cd /d "%ROOT%apps\admin" ^&^& node "%VITE%" --host 0.0.0.0 ^> "%ADMIN_LOG%" 2^>^&1"
  echo       管理后台正在启动：http://localhost:5173
) else (
  echo       管理后台已在运行：http://localhost:5173
)

echo.
echo 启动命令已执行，请等待 5 秒后使用：
echo   小程序接口：127.0.0.1:3000
echo   管理后台：http://localhost:5173
echo.
echo 日志位置：tmp\api.log 和 tmp\admin.log
pause
