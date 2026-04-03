"""Project member management service."""
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.domain.models import ProjectMember, Project, LocalAccount


class ProjectMemberService:
    """Service for project member management."""

    @staticmethod
    async def get_project_members(db: AsyncSession, project_id: int) -> List[ProjectMember]:
        """Get all members of a project."""
        result = await db.execute(
            select(ProjectMember)
            .options(selectinload(ProjectMember.user))
            .where(ProjectMember.project_id == project_id)
            .order_by(ProjectMember.created_at)
        )
        return result.scalars().all()

    @staticmethod
    async def get_member(
        db: AsyncSession,
        project_id: int,
        telegram_user_id: int
    ) -> Optional[ProjectMember]:
        """Get project member by project and user ID."""
        result = await db.execute(
            select(ProjectMember)
            .where(
                ProjectMember.project_id == project_id,
                ProjectMember.telegram_user_id == telegram_user_id
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def add_member(
        db: AsyncSession,
        project_id: int,
        telegram_user_id: int,
        role: str = "viewer",
    ) -> ProjectMember:
        """Add member to project."""
        # Check if already member
        existing = await ProjectMemberService.get_member(db, project_id, telegram_user_id)
        if existing:
            existing.role = role
            return existing

        member = ProjectMember(
            project_id=project_id,
            telegram_user_id=telegram_user_id,
            role=role,
        )
        db.add(member)
        return member

    @staticmethod
    async def update_member_role(
        db: AsyncSession,
        project_id: int,
        telegram_user_id: int,
        new_role: str,
    ) -> bool:
        """Update member role."""
        member = await ProjectMemberService.get_member(db, project_id, telegram_user_id)
        if not member:
            return False
        member.role = new_role
        return True

    @staticmethod
    async def remove_member(
        db: AsyncSession,
        project_id: int,
        telegram_user_id: int,
    ) -> bool:
        """Remove member from project."""
        member = await ProjectMemberService.get_member(db, project_id, telegram_user_id)
        if not member:
            return False
        await db.delete(member)
        return True

    @staticmethod
    async def get_user_role(db: AsyncSession, project_id: int, telegram_user_id: int) -> Optional[str]:
        """Get user's role in project."""
        member = await ProjectMemberService.get_member(db, project_id, telegram_user_id)
        return member.role if member else None

    @staticmethod
    async def is_admin(db: AsyncSession, project_id: int, telegram_user_id: int) -> bool:
        """Check if user is project admin."""
        role = await ProjectMemberService.get_user_role(db, project_id, telegram_user_id)
        return role == "admin"

    @staticmethod
    async def can_edit(db: AsyncSession, project_id: int, telegram_user_id: int) -> bool:
        """Check if user can edit project (admin or editor)."""
        role = await ProjectMemberService.get_user_role(db, project_id, telegram_user_id)
        return role in ["admin", "editor"]
