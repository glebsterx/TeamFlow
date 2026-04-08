"""Main application entry point."""
import asyncio
import uvicorn
from multiprocessing import Process
from app.config import settings
from app.core.logging import configure_logging, get_logger
from app.core.db import init_db
from app.core.bootstrap import bootstrap_secret_key, bootstrap_vapid_keys, backup_database
from app.telegram.bot import run_bot

logger = get_logger(__name__)


async def startup():
    """Application startup."""
    configure_logging()
    logger.info("application_starting", version=settings.VERSION)
    
    # Auto-generate secrets if missing/default
    bootstrap_secret_key()
    bootstrap_vapid_keys()
    
    # Auto-backup database
    backup_database()
    
    # Initialize database
    await init_db()
    logger.info("database_initialized")


def run_api():
    """Run FastAPI server."""
    from app.web.app import app
    
    uvicorn.run(
        app,
        host=settings.API_HOST,
        port=settings.API_PORT,
        log_level="info" if settings.DEBUG else "warning"
    )


def main():
    """Main entry point - run both bot and API."""
    
    # Run startup
    asyncio.run(startup())
    
    # Start API server in separate process
    api_process = Process(target=run_api)
    api_process.start()
    
    logger.info("api_server_started", port=settings.API_PORT)
    
    # Run bot in main process
    try:
        run_bot()
    except KeyboardInterrupt:
        logger.info("application_shutting_down")
    finally:
        api_process.terminate()
        api_process.join()


if __name__ == "__main__":
    main()
