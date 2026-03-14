"""Project repository."""
from typing import List, Optional, Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.domain.models import Project, Task


class ProjectRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all_active(self) -> List[Project]:
        result = await self.session.execute(
            select(Project)
            .where(Project.is_active == True)
            .where(Project.deleted == False)
            .order_by(Project.name)
        )
        return list(result.scalars().all())

    async def get_archived(self) -> List[Project]:
        """Get archived (inactive) projects."""
        result = await self.session.execute(
            select(Project)
            .where(Project.is_active == False)
            .where(Project.deleted == False)
            .order_by(Project.name)
        )
        return list(result.scalars().all())

    async def get_by_id(self, project_id: int) -> Optional[Project]:
        result = await self.session.execute(
            select(Project).where(Project.id == project_id)
        )
        return result.scalar_one_or_none()

    async def create(self, name: str, description: str = None, emoji: str = "📁", parent_project_id: int = None) -> Project:
        project = Project(name=name, description=description, emoji=emoji, parent_project_id=parent_project_id)
        self.session.add(project)
        await self.session.flush()
        return project

    async def can_delete(self, project_id: int) -> Dict[str, Any]:
        """Check if project can be safely deleted."""
        # Check for subprojects
        subprojects_result = await self.session.execute(
            select(Project).where(Project.parent_project_id == project_id).where(Project.deleted == False)
        )
        subprojects = list(subprojects_result.scalars().all())
        
        # Check for tasks
        tasks_result = await self.session.execute(
            select(Task).where(Task.project_id == project_id).where(Task.deleted == False)
        )
        tasks = list(tasks_result.scalars().all())
        
        return {
            "can_delete": len(subprojects) == 0 and len(tasks) == 0,
            "subprojects_count": len(subprojects),
            "tasks_count": len(tasks),
            "subprojects": [{"id": p.id, "name": p.name} for p in subprojects],
            "tasks": [{"id": t.id, "title": t.title} for t in tasks[:10]]  # First 10 tasks
        }

    async def archive(self, project_id: int) -> bool:
        """Archive project (set is_active=False)."""
        project = await self.get_by_id(project_id)
        if project:
            project.is_active = False
            await self.session.flush()
            return True
        return False

    async def restore(self, project_id: int) -> bool:
        """Restore archived project."""
        project = await self.get_by_id(project_id)
        if project:
            project.is_active = True
            await self.session.flush()
            return True
        return False

    async def soft_delete(self, project_id: int) -> bool:
        """Soft delete project."""
        project = await self.get_by_id(project_id)
        if project:
            project.deleted = True
            project.is_active = False
            await self.session.flush()
            return True
        return False
