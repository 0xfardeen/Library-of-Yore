"""Entry point for LibraryOfYore desktop application."""
import sys
import os
import traceback

# Ensure bundled resources are found when running from PyInstaller
if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

os.environ.setdefault("LIBRARYOFYORE_BASE", BASE_DIR)

# Crash log path — written next to the exe so it's easy to find
CRASH_LOG = os.path.join(BASE_DIR, "crash_log.txt")

from loy_server import run_server
run_server(daemon=True)

def main():
    from PyQt6.QtWidgets import QApplication
    from PyQt6.QtCore import Qt
    from PyQt6.QtGui import QFont
    from ui.main_window import MainWindow

    # Enable high-DPI scaling
    QApplication.setHighDpiScaleFactorRoundingPolicy(
        Qt.HighDpiScaleFactorRoundingPolicy.PassThrough
    )

    app = QApplication(sys.argv)
    app.setApplicationName("Library of Yore")
    app.setApplicationVersion("1.0.0")
    app.setOrganizationName("LibraryOfYore")

    font = QFont("Segoe UI", 10)
    app.setFont(font)

    window = MainWindow()
    window.show()

    print("Library of Yore v1.0.0 started successfully.")
    sys.exit(app.exec())


if __name__ == "__main__":
    try:
        main()
    except Exception:
        error_text = traceback.format_exc()
        # Write crash log next to the exe
        try:
            with open(CRASH_LOG, "w", encoding="utf-8") as f:
                f.write("Library of Yore — Crash Report\n")
                f.write("=" * 50 + "\n\n")
                f.write(error_text)
        except Exception:
            pass
        # Also try to show a message box if Qt is available
        try:
            from PyQt6.QtWidgets import QApplication, QMessageBox
            _app = QApplication.instance() or QApplication(sys.argv)
            msg = QMessageBox()
            msg.setIcon(QMessageBox.Icon.Critical)
            msg.setWindowTitle("Library of Yore — Startup Error")
            msg.setText("The application failed to start.")
            msg.setDetailedText(error_text)
            msg.exec()
        except Exception:
            pass
        sys.exit(1)
