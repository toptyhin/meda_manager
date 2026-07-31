from abc import ABC, abstractmethod
from typing import Optional


class GenerationError(Exception):
    """Raised when an AI provider fails to generate or improve content."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


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
    async def improve_prompt(self, text: str, category: Optional[str] = None) -> str:
        """Improve / structure a prompt for image generation."""
