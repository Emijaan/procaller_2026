from pathlib import Path

p = Path("/etc/asterisk/ari.conf")
text = p.read_text()
text = text.replace("enabled = no", "enabled = yes", 1)
if 'ari_procaller' not in text:
    text += '\n#include "ari_procaller.conf"\n'
p.write_text(text)
print("ari.conf updated")
