"""Team management service."""
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta
import secrets

from app.domain.models import TeamMember, TeamInvite, LocalAccount
from app.domain.enums import TeamRole


class TeamService:
    """Service for team management."""

    @staticmethod
    async def get_all_members(db: AsyncSession) -> List[TeamMember]:
        """Get all team members."""
        result = await db.execute(
            select(TeamMember)
            .options(selectinload(TeamMember.user))
            .order_by(TeamMember.joined_at)
        )
        return result.scalars().all()

    @staticmethod
    async def get_member(db: AsyncSession, member_id: int) -> Optional[TeamMember]:
        """Get team member by ID."""
        result = await db.execute(
            select(TeamMember)
            .options(selectinload(TeamMember.user))
            .where(TeamMember.id == member_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_member_by_user_id(db: AsyncSession, telegram_user_id: int) -> Optional[TeamMember]:
        """Get team member by Telegram user ID."""
        result = await db.execute(
            select(TeamMember)
            .where(TeamMember.telegram_user_id == telegram_user_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_member_role(db: AsyncSession, telegram_user_id: int) -> Optional[str]:
        """Get user's team role."""
        member = await TeamService.get_member_by_user_id(db, telegram_user_id)
        return member.role if member else None

    @staticmethod
    async def is_owner_or_admin(db: AsyncSession, telegram_user_id: int) -> bool:
        """Check if user is owner or admin."""
        role = await TeamService.get_member_role(db, telegram_user_id)
        return role in [TeamRole.OWNER.value, TeamRole.ADMIN.value]

    @staticmethod
    async def get_first_user(db: AsyncSession) -> Optional[LocalAccount]:
        """Get first registered user (potential owner)."""
        result = await db.execute(
            select(LocalAccount)
            .order_by(LocalAccount.created_at.asc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def ensure_owner_exists(db: AsyncSession) -> bool:
        """Ensure at least one owner exists. If no team members, first user becomes owner."""
        # Check if any owners exist
        result = await db.execute(
            select(TeamMember).where(TeamMember.role == TeamRole.OWNER.value)
        )
        if result.scalar_one_or_none():
            return True  # Owner already exists

        # No owner - make first user owner
        first_user = await TeamService.get_first_user(db)
        if first_user:
            # Check if user is already in team
            existing_member = await TeamService.get_member_by_user_id(db, first_user.id)
            if existing_member:
                existing_member.role = TeamRole.OWNER.value
            else:
                # Create new team member as owner
                new_member = TeamMember(
                    telegram_user_id=first_user.id,
                    role=TeamRole.OWNER.value,
                    invited_by_id=None,
                )
                db.add(new_member)
            return True

        return False  # No users at all

    @staticmethod
    async def create_invite(
        db: AsyncSession,
        created_by_id: int,
        role: str = "member",
        telegram_username: Optional[str] = None,
        email: Optional[str] = None,
        expires_days: int = 7,
    ) -> TeamInvite:
        """Create team invite."""
        invite_token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(days=expires_days)

        invite = TeamInvite(
            invite_token=invite_token,
            telegram_username=telegram_username.lstrip('@') if telegram_username else None,
            email=email,
            role=role,
            created_by_id=created_by_id,
            expires_at=expires_at,
        )
        db.add(invite)
        return invite

    @staticmethod
    async def get_active_invites(db: AsyncSession) -> List[TeamInvite]:
        """Get all active invites."""
        result = await db.execute(
            select(TeamInvite)
            .where(TeamInvite.is_active == True)
            .order_by(TeamInvite.created_at.desc())
        )
        return result.scalars().all()

    @staticmethod
    async def get_invite_by_token(db: AsyncSession, token: str) -> Optional[TeamInvite]:
        """Get invite by token."""
        result = await db.execute(
            select(TeamInvite).where(TeamInvite.invite_token == token)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def accept_invite(
        db: AsyncSession,
        invite: TeamInvite,
        telegram_user_id: int,
    ) -> TeamMember:
        """Accept invite and create team member."""
        # Create team member
        member = TeamMember(
            telegram_user_id=telegram_user_id,
            role=invite.role,
            invited_by_id=invite.created_by_id,
        )
        db.add(member)

        # Mark invite as used
        invite.is_active = False
        invite.used_at = datetime.utcnow()
        invite.used_by_telegram_id = telegram_user_id

        return member

    @staticmethod
    async def remove_member(db: AsyncSession, member_id: int) -> bool:
        """Remove team member."""
        result = await db.execute(
            select(TeamMember).where(TeamMember.id == member_id)
        )
        member = result.scalar_one_or_none()
        if not member:
            return False

        # Cannot remove owner
        if member.role == TeamRole.OWNER.value:
            return False

        await db.delete(member)
        return True

    @staticmethod
    async def update_member_role(
        db: AsyncSession,
        member_id: int,
        new_role: str,
    ) -> bool:
        """Update member role."""
        result = await db.execute(
            select(TeamMember).where(TeamMember.id == member_id)
        )
        member = result.scalar_one_or_none()
        if not member:
            return False

        # Cannot change owner role
        if member.role == TeamRole.OWNER.value:
            return False

        member.role = new_role
        return True
