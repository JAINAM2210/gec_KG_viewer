"""Create a deployable ZIP containing only the static website assets."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

here = Path(__file__).resolve().parent
output = here / 'kg_viewer2_site.zip'
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for name in ('index.html', 'styles.css', 'app.js', 'ui.js', 'core.js', 'data.js'):
        archive.write(here / name, name)
print(f'Created {output}')
