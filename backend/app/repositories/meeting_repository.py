"""Meeting repository for data access."""
from typing import Optional, List
from datetime import datetime, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.models import Meeting
from app.core.clock import Clock


class MeetingRepository:
    """Repository for Meeting entity."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def create(self, meeting: Meeting) -> Meeting:
        """Create new meeting record."""
        self.session.add(meeting)
        await self.session.flush()
        await self.session.refresh(meeting)
        return meeting
    
    async def get_by_id(self, meeting_id: int) -> Optional[Meeting]:
        """Get meeting by ID."""
        result = await self.session.execute(
            select(Meeting).where(Meeting.id == meeting_id)
        )
        return result.scalar_one_or_none()
    
    async def get_all(
        self,
        limit: int = 100,
        offset: int = 0
    ) -> List[Meeting]:
        """Get all meetings ordered by date."""
        result = await self.session.execute(
            select(Meeting)
            .order_by(Meeting.meeting_date.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())
    
    async def get_recent(self, days: int = 30) -> List[Meeting]:
        """Get recent meetings."""
        cutoff_date = Clock.now() - timedelta(days=days)
        result = await self.session.execute(
            select(Meeting)
            .where(Meeting.meeting_date >= cutoff_date)
            .order_by(Meeting.meeting_date.desc())
        )
        return list(result.scalars().all())
    
    async def delete(self, meeting_id: int) -> bool:
        """Delete meeting."""
        meeting = await self.get_by_id(meeting_id)
        if meeting:
            await self.session.delete(meeting)
            return True
        return False

