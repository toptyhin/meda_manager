from fastapi import APIRouter

from app.api import (
    admin,
    assistant,
    auth,
    categories,
    generations,
    images,
    invites,
    limits,
    media_ingress,
    prompts,
    providers,
    sales_plan,
    settings,
    styles,
    videos,
)

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(invites.router, prefix="/invites", tags=["invites"])
api_router.include_router(categories.router, prefix="/categories", tags=["categories"])
api_router.include_router(prompts.router, prefix="/prompts", tags=["prompts"])
api_router.include_router(styles.router, prefix="/styles", tags=["styles"])
api_router.include_router(images.router, prefix="/images", tags=["images"])
api_router.include_router(generations.router, prefix="/generations", tags=["generations"])
api_router.include_router(
    videos.generations_router, prefix="/video-generations", tags=["video-generations"]
)
api_router.include_router(videos.videos_router, prefix="/videos", tags=["videos"])
api_router.include_router(
    media_ingress.router, prefix="/media-ingress", tags=["media-ingress"]
)
api_router.include_router(assistant.router, prefix="/assistant", tags=["assistant"])
api_router.include_router(providers.router, prefix="/providers", tags=["providers"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(limits.router, prefix="/limits", tags=["limits"])
api_router.include_router(admin.tariffs_router, prefix="/admin/tariffs", tags=["admin-tariffs"])
api_router.include_router(admin.tg_users_router, prefix="/admin/tg-users", tags=["admin-tg-users"])
api_router.include_router(
    sales_plan.router, prefix="/sales-scenarios", tags=["sales-plan"]
)
