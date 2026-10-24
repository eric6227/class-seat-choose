"""PyInstaller 入口 - 修正工作目录后启动原始 app"""
import os
import sys

if getattr(sys, 'frozen', False):
    os.chdir(os.path.dirname(sys.executable))

from app.main import app as _application

import uvicorn

if __name__ == "__main__":
    uvicorn.run(_application, host="127.0.0.1", port=8481, log_level="info")