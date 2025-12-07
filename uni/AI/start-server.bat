@echo off
echo Starting local HTTP server...
echo.
echo Open your browser at:
echo   - Main app: http://localhost:8000/index.html
echo   - Test page: http://localhost:8000/kb-test.html
echo.
echo Press Ctrl+C to stop the server
echo.
python -m http.server 8000
