from pathlib import Path

from django.conf import settings
from django.http import Http404
from django.views.static import serve


def frontend_dir() -> Path:
    configured = getattr(settings, "FRONTEND_DIST", None)
    return Path(configured) if configured else Path(__file__).resolve().parents[2] / "frontend" / "dist"


def spa(request, path=""):
    root = frontend_dir().resolve()
    if path:
        candidate = (root / path).resolve()
        try:
            candidate.relative_to(root)
        except ValueError as exc:
            raise Http404() from exc
        if candidate.is_file():
            return serve(request, path, document_root=str(root))
    if not (root / "index.html").is_file():
        raise Http404("Frontend not built")
    response = serve(request, "index.html", document_root=str(root))
    response["Cache-Control"] = "no-store"
    return response
