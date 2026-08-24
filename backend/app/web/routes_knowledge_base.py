"""Knowledge base routes — folders, pages, trash/restore."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, or_, update

from app.core.db import get_db
from app.core.clock import Clock
from app.domain.models import KnowledgeFolder, KnowledgePage

router = APIRouter()


@router.get("/knowledge-base/folders")
async def get_knowledge_folders(db: AsyncSession = Depends(get_db)):
    """Get all knowledge folders (tree structure)."""

    q = select(KnowledgeFolder).where(KnowledgeFolder.deleted_at.is_(None)).order_by(KnowledgeFolder.order, KnowledgeFolder.name)
    result = await db.execute(q)
    folders = result.scalars().all()
    return [
        {
            "id": f.id,
            "name": f.name,
            "parent_id": f.parent_id,
            "order": f.order,
            "created_at": f.created_at.isoformat() if f.created_at else None,
            "updated_at": f.updated_at.isoformat() if f.updated_at else None,
        }
        for f in folders
    ]


@router.post("/knowledge-base/folders")
async def create_knowledge_folder(request: dict, db: AsyncSession = Depends(get_db)):
    """Create knowledge folder."""

    folder = KnowledgeFolder(
        name=request.get("name", "Новая папка"),
        parent_id=request.get("parent_id"),
        order=request.get("order", 0),
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return {
        "id": folder.id,
        "name": folder.name,
        "parent_id": folder.parent_id,
        "order": folder.order,
        "created_at": folder.created_at.isoformat() if folder.created_at else None,
        "updated_at": folder.updated_at.isoformat() if folder.updated_at else None,
    }


@router.patch("/knowledge-base/folders/{folder_id}")
async def update_knowledge_folder(folder_id: int, request: dict, db: AsyncSession = Depends(get_db)):
    """Update knowledge folder."""

    result = await db.execute(select(KnowledgeFolder).where(KnowledgeFolder.id == folder_id))
    folder = result.scalar_one_or_none()
    if not folder or folder.deleted_at:
        raise HTTPException(status_code=404, detail="Folder not found")
    if request.get("name"):
        folder.name = request["name"]
    if "parent_id" in request:
        folder.parent_id = request["parent_id"]
    if request.get("order") is not None:
        folder.order = request["order"]
    await db.commit()
    await db.refresh(folder)
    return {"ok": True, "id": folder.id}


@router.delete("/knowledge-base/folders/{folder_id}")
async def delete_knowledge_folder(folder_id: int, db: AsyncSession = Depends(get_db)):
    """Soft delete knowledge folder (moves to trash with all children)."""

    async def soft_delete_folder_recursive(folder_id: int):
        result = await db.execute(select(KnowledgeFolder).where(KnowledgeFolder.parent_id == folder_id))
        child_folders = result.scalars().all()
        for child in child_folders:
            await soft_delete_folder_recursive(child.id)

        pages_result = await db.execute(select(KnowledgePage).where(KnowledgePage.folder_id == folder_id))
        pages = pages_result.scalars().all()
        for page in pages:
            page.deleted_at = Clock.now()

        folder_result = await db.execute(select(KnowledgeFolder).where(KnowledgeFolder.id == folder_id))
        folder = folder_result.scalar_one_or_none()
        if folder:
            folder.deleted_at = Clock.now()

    await soft_delete_folder_recursive(folder_id)
    await db.commit()
    return {"ok": True}


@router.get("/knowledge-base/pages")
async def get_knowledge_pages(db: AsyncSession = Depends(get_db)):
    """Get all knowledge pages."""

    result = await db.execute(
        select(KnowledgePage)
        .where(KnowledgePage.deleted_at.is_(None))
        .where(or_(KnowledgePage.folder_id == None, KnowledgePage.folder_id.in_(
            select(KnowledgeFolder.id).where(KnowledgeFolder.deleted_at.is_(None))
        )))
        .order_by(KnowledgePage.order)
    )
    pages = result.scalars().all()
    return [
        {
            "id": p.id,
            "title": p.title,
            "content": p.content,
            "folder_id": p.folder_id,
            "order": p.order,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        }
        for p in pages
    ]


@router.post("/knowledge-base/pages")
async def create_knowledge_page(request: dict, db: AsyncSession = Depends(get_db)):
    """Create knowledge page."""

    page = KnowledgePage(
        title=request.get("title", "Новая страница"),
        content=request.get("content"),
        folder_id=request.get("folder_id"),
        order=request.get("order", 0),
    )
    db.add(page)
    await db.commit()
    await db.refresh(page)
    return {
        "id": page.id,
        "title": page.title,
        "content": page.content,
        "folder_id": page.folder_id,
        "order": page.order,
        "created_at": page.created_at.isoformat() if page.created_at else None,
        "updated_at": page.updated_at.isoformat() if page.updated_at else None,
    }


@router.patch("/knowledge-base/pages/{page_id}")
async def update_knowledge_page(page_id: int, request: dict, db: AsyncSession = Depends(get_db)):
    """Update knowledge page."""

    result = await db.execute(select(KnowledgePage).where(KnowledgePage.id == page_id))
    page = result.scalar_one_or_none()
    if not page or page.deleted_at:
        raise HTTPException(status_code=404, detail="Page not found")
    if request.get("title"):
        page.title = request["title"]
    if "content" in request:
        page.content = request["content"]
    if "folder_id" in request:
        page.folder_id = request["folder_id"]
    if request.get("order") is not None:
        page.order = request["order"]
    await db.commit()
    await db.refresh(page)
    return {"ok": True, "id": page.id}


@router.delete("/knowledge-base/pages/{page_id}")
async def delete_knowledge_page(page_id: int, db: AsyncSession = Depends(get_db)):
    """Soft delete knowledge page."""

    result = await db.execute(select(KnowledgePage).where(KnowledgePage.id == page_id))
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    page.deleted_at = Clock.now()
    await db.commit()
    return {"ok": True}


@router.get("/knowledge-base/trash")
async def get_knowledge_trash(db: AsyncSession = Depends(get_db)):
    """Get deleted knowledge pages and folders."""

    pages_result = await db.execute(
        select(KnowledgePage)
        .where(KnowledgePage.deleted_at.isnot(None))
        .order_by(KnowledgePage.deleted_at.desc())
    )
    pages = pages_result.scalars().all()

    folders_result = await db.execute(
        select(KnowledgeFolder)
        .where(KnowledgeFolder.deleted_at.isnot(None))
        .order_by(KnowledgeFolder.deleted_at.desc())
    )
    folders = folders_result.scalars().all()

    return {
        "pages": [
            {
                "id": p.id,
                "title": p.title,
                "content": p.content,
                "folder_id": p.folder_id,
                "deleted_at": p.deleted_at.isoformat() if p.deleted_at else None,
                "type": "page",
            }
            for p in pages
        ],
        "folders": [
            {
                "id": f.id,
                "title": f.name,
                "parent_id": f.parent_id,
                "deleted_at": f.deleted_at.isoformat() if f.deleted_at else None,
                "type": "folder",
            }
            for f in folders
        ],
    }


@router.post("/knowledge-base/trash/{item_id}/restore")
async def restore_knowledge_item(item_id: int, type: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """Restore deleted knowledge page or folder (with all parents path).

    `type` ("page"/"folder") disambiguates id collisions between the two tables.
    """

    page = None
    if type != "folder":
        page_result = await db.execute(select(KnowledgePage).where(KnowledgePage.id == item_id))
        page = page_result.scalar_one_or_none()
    if page and page.deleted_at:
        folder_id = page.folder_id
        await db.execute(
            update(KnowledgePage).where(KnowledgePage.id == item_id).values(deleted_at=None)
        )

        # Restore parents path from bottom to top
        while folder_id:
            folder_result = await db.execute(select(KnowledgeFolder).where(KnowledgeFolder.id == folder_id))
            folder = folder_result.scalar_one_or_none()
            if folder and folder.deleted_at:
                await db.execute(
                    update(KnowledgeFolder).where(KnowledgeFolder.id == folder_id).values(deleted_at=None)
                )
                folder_id = folder.parent_id
            else:
                break

        await db.commit()
        return {"ok": True}

    folder_result = await db.execute(select(KnowledgeFolder).where(KnowledgeFolder.id == item_id))
    folder = folder_result.scalar_one_or_none()
    if folder and folder.deleted_at:
        # Restore all parent folders from bottom to top (so the path is visible)
        parent_id = folder.parent_id
        while parent_id:
            parent_result = await db.execute(select(KnowledgeFolder).where(KnowledgeFolder.id == parent_id))
            parent = parent_result.scalar_one_or_none()
            if parent and parent.deleted_at:
                await db.execute(
                    update(KnowledgeFolder).where(KnowledgeFolder.id == parent_id).values(deleted_at=None)
                )
                parent_id = parent.parent_id
            else:
                break

        # Restore the folder itself and its whole subtree (mirror of cascade delete)
        async def restore_subtree(fid: int):
            await db.execute(
                update(KnowledgeFolder).where(KnowledgeFolder.id == fid).values(deleted_at=None)
            )
            await db.execute(
                update(KnowledgePage).where(KnowledgePage.folder_id == fid).values(deleted_at=None)
            )
            children = await db.execute(select(KnowledgeFolder.id).where(KnowledgeFolder.parent_id == fid))
            for (child_id,) in children.all():
                await restore_subtree(child_id)

        await restore_subtree(folder.id)
        await db.commit()
        return {"ok": True}

    raise HTTPException(status_code=404, detail="Item not found")


@router.delete("/knowledge-base/trash/folders/{folder_id}")
async def permanently_delete_knowledge_folder(folder_id: int, db: AsyncSession = Depends(get_db)):
    """Permanently delete knowledge folder and its whole subtree."""

    result = await db.execute(select(KnowledgeFolder).where(KnowledgeFolder.id == folder_id))
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    # SQLite FK enforcement is off — delete children explicitly to avoid orphans.
    async def purge_subtree(fid: int):
        children = await db.execute(select(KnowledgeFolder.id).where(KnowledgeFolder.parent_id == fid))
        for (child_id,) in children.all():
            await purge_subtree(child_id)
        await db.execute(delete(KnowledgePage).where(KnowledgePage.folder_id == fid))
        await db.execute(delete(KnowledgeFolder).where(KnowledgeFolder.id == fid))

    await purge_subtree(folder_id)
    await db.commit()
    return {"ok": True}


@router.delete("/knowledge-base/trash/{page_id}")
async def permanently_delete_knowledge_page(page_id: int, db: AsyncSession = Depends(get_db)):
    """Permanently delete knowledge page."""

    result = await db.execute(select(KnowledgePage).where(KnowledgePage.id == page_id))
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    await db.delete(page)
    await db.commit()
    return {"ok": True}
