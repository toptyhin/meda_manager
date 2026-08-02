from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from typing import Any, Optional


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


@dataclass
class ModelPricing:
    prompt_per_1m: Optional[float] = None
    completion_per_1m: Optional[float] = None
    image: Optional[float] = None
    request: Optional[float] = None
    input_cache_read_per_1m: Optional[float] = None
    unit: Optional[str] = None  # "token" | "image" | "request"


@dataclass
class ModelInfo:
    id: str
    provider: str
    kind: str  # chat | image | video | audio | embedding | other
    context_length: Optional[int] = None
    max_output_length: Optional[int] = None
    input_modalities: list[str] = field(default_factory=list)
    output_modalities: list[str] = field(default_factory=list)
    pricing: Optional[ModelPricing] = None
    raw: dict = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ModelInfo":
        pricing_raw = data.get("pricing")
        pricing = ModelPricing(**pricing_raw) if isinstance(pricing_raw, dict) else None
        return cls(
            id=str(data["id"]),
            provider=str(data["provider"]),
            kind=str(data.get("kind") or "other"),
            context_length=data.get("context_length"),
            max_output_length=data.get("max_output_length"),
            input_modalities=list(data.get("input_modalities") or []),
            output_modalities=list(data.get("output_modalities") or []),
            pricing=pricing,
            raw=dict(data.get("raw") or {}),
        )


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
        kind: Optional[object] = None,
    ) -> str:
        """Improve / structure a prompt for image or video generation.

        ``kind`` selects the mode-specific default template (see ImproveKind).
        """

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


class ChatProvider(ABC):
    @abstractmethod
    async def improve_prompt(
        self,
        text: str,
        category: Optional[str] = None,
        kind: Optional[object] = None,
        system: Optional[str] = None,
    ) -> str:
        """Improve / structure a prompt using a chat/LLM model."""

    @abstractmethod
    async def vision_prompt(
        self,
        image: bytes,
        system: str,
        instruction: str = "Describe this image as an AI image generation prompt.",
    ) -> str:
        """Build a prompt from an image via a vision-capable chat model."""

    async def aclose(self) -> None:
        """Close any owned HTTP resources. Default is a no-op."""


class ModelCatalog(ABC):
    @abstractmethod
    async def list_models(self) -> list[ModelInfo]:
        """Return available models for this provider (normalized)."""

    async def aclose(self) -> None:
        """Close any owned HTTP resources. Default is a no-op."""
