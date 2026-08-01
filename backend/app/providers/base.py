from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional


class GenerationError(Exception):
    """Raised when an AI provider fails to generate or improve content."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass
class ImageReview:
    score: int
    passed: bool
    issues: list[dict] = field(default_factory=list)
    fix_mode: str = "i2i"  # "i2i" | "regen"
    fix_instructions: str = ""


@dataclass
class VideoTaskRef:
    task_id: str
    video_id: str


@dataclass
class VideoTaskResult:
    status: str  # queued | in_progress | completed | failed
    progress: int = 0
    url: Optional[str] = None
    seconds: Optional[float] = None
    size: Optional[str] = None  # e.g. "1280x768"
    error: Optional[str] = None


class ImageProvider(ABC):
    @abstractmethod
    async def generate(
        self,
        prompt: str,
        images: list[bytes],
        size: str = "1K",
        ratio: str = "1:1",
    ) -> bytes:
        """Generate or edit an image. Returns raw image bytes."""

    @abstractmethod
    async def improve_prompt(
        self,
        text: str,
        category: Optional[str] = None,
        kind: str = "image",
    ) -> str:
        """Improve / structure a prompt for image or video generation."""

    @abstractmethod
    async def review_image(self, prompt: str, image_url: str) -> ImageReview:
        """Evaluate a generated image against the original prompt.

        ``image_url`` must be a publicly fetchable HTTP(S) URL — Agnes vision
        does not accept data URIs.
        """


class VideoProvider(ABC):
    @abstractmethod
    async def create_video_task(
        self,
        prompt: str,
        *,
        mode: str = "t2v",
        image_urls: Optional[list[str]] = None,
        width: int = 1152,
        height: int = 768,
        num_frames: int = 121,
        frame_rate: float = 24,
        seed: Optional[int] = None,
        negative_prompt: Optional[str] = None,
    ) -> VideoTaskRef:
        """Create an async video generation task."""

    @abstractmethod
    async def get_video_result(self, video_id: str) -> VideoTaskResult:
        """Poll video task status / result by video_id."""

    @abstractmethod
    async def download_video(self, url: str) -> bytes:
        """Download generated video bytes from a result URL."""
