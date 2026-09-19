from pathlib import Path

p = Path("/etc/asterisk/confbridge.conf")
text = p.read_text() if p.exists() else ""
if "confbridge_procaller" not in text:
    if text and not text.endswith("\n"):
        text += "\n"
    text += '#include "confbridge_procaller.conf"\n'
    p.write_text(text)
    print("confbridge include added")
else:
    print("confbridge include already present")
