from pathlib import Path
import subprocess

sip = Path("/etc/asterisk/sip.conf")
text = sip.read_text()
if "sip_procaller.conf" not in text:
    sip.write_text(text.rstrip() + '\n#include sip_procaller.conf\n')
    print("sip include added")
else:
    print("sip include already present")

keys = Path("/etc/asterisk/keys")
keys.mkdir(parents=True, exist_ok=True)
pem = keys / "procaller.pem"
if not pem.exists():
    subprocess.check_call([
        "openssl", "req", "-new", "-x509", "-days", "3650", "-nodes",
        "-subj", "/CN=procaller",
        "-out", str(pem), "-keyout", str(pem),
    ])
    print("dtls cert created")
else:
    print("dtls cert exists")
subprocess.check_call(["chown", "asterisk:asterisk", str(pem)])
subprocess.check_call(["chmod", "640", str(pem)])
