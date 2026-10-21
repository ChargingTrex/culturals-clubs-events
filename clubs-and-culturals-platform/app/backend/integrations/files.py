import hashlib
from pathlib import Path

from django.conf import settings

from integrations.base import FileStore


class LocalFileStore(FileStore):
    """
    Standalone mode: the module's own bucket. The DB holds the key and metadata
    only, never the bytes (AGENT_PROMPT §2).

    Keys are content-addressed, so re-uploading the same receipt is idempotent
    and a replacement never overwrites the file the old row points at — which is
    what §5 means by "replacements supersede, never overwrite".
    """

    def __init__(self, root=None):
        self.root = Path(root or (settings.BASE_DIR / "media"))

    def put(self, *, key, content, content_type):
        digest = hashlib.sha256(content).hexdigest()
        path = self.root / digest[:2] / f"{digest}-{Path(key).name}"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return {
            "key": str(path.relative_to(self.root)),
            "sha256": digest,
            "bytes": len(content),
            "content_type": content_type,
        }

    def url_for(self, key):
        return f"/media/{key}"


class PlatformFileStore(FileStore):
    def put(self, *, key, content, content_type):
        raise NotImplementedError("PlatformFileStore requires the platform file service.")

    def url_for(self, key):
        raise NotImplementedError("PlatformFileStore requires the platform file service.")
