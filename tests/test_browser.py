"""Current browser integration entrypoint; see browser_v04.py."""
import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).with_name("browser_v04.py")),run_name="__main__")
