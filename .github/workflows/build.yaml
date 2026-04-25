@echo off
echo Building Library of Yore (single-file portable)...
python -m PyInstaller --name LibraryOfYore --onefile --windowed --noconfirm --clean --icon assets\logo.ico --add-data "scrapers;scrapers" --add-data "database;database" --add-data "ui;ui" --add-data "utils;utils" --add-data "assets;assets" --add-data "config.py;." --hidden-import scrapers.novelfire --hidden-import scrapers.wuxiaworld --hidden-import scrapers.freewebnovel --hidden-import scrapers.novelupdates --hidden-import database.connection --hidden-import database.models --hidden-import pymongo --hidden-import gridfs --hidden-import openpyxl --hidden-import PIL --hidden-import playwright --hidden-import requests --hidden-import bs4 --hidden-import dateutil main.py
if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)
echo Build complete! Single portable exe: dist\LibraryOfYore.exe
pause
