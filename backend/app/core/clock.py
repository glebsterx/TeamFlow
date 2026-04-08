"""Clock module for time operations."""
from datetime import datetime, timezone, timedelta
from typing import Optional
from dateutil import tz as dateutil_tz
from dateutil import parser as date_parser


class Clock:
    """Utility class for time operations.

    Clock.now() returns naive UTC datetime — compatible with DB columns
    that store naive UTC (DateTime without timezone=True).
    """

    @staticmethod
    def now() -> datetime:
        """Get current UTC datetime (naive, for DB compatibility)."""
        return datetime.now(timezone.utc).replace(tzinfo=None)

    @staticmethod
    def now_tz(timezone_str: str = "UTC") -> datetime:
        """Get current time in the given timezone (aware)."""
        tz = dateutil_tz.gettz(timezone_str)
        if tz is None:
            tz = dateutil_tz.gettz("UTC")
        return datetime.now(tz=tz)

    @staticmethod
    def parse_date(date_str: str) -> Optional[datetime]:
        """Parse date string to datetime."""
        try:
            return date_parser.parse(date_str)
        except (ValueError, TypeError):
            return None

    @staticmethod
    def format_date(dt: datetime, format_str: str = "%Y-%m-%d %H:%M:%S") -> str:
        """Format datetime to string."""
        return dt.strftime(format_str)

    @staticmethod
    def is_past(dt: datetime) -> bool:
        """Check if datetime is in the past."""
        return dt < Clock.now()

    @staticmethod
    def is_this_week(dt: datetime) -> bool:
        """Check if datetime is in current week."""
        now = Clock.now()
        week_start = now - timedelta(days=now.weekday())
        week_end = week_start + timedelta(days=7)
        return week_start <= dt < week_end
