"""Message parsing service for automatic task detection."""
import re
from datetime import datetime, timedelta
from typing import Optional, List
from dataclasses import dataclass
from app.core.clock import Clock
from app.core.logging import get_logger

logger = get_logger(__name__)

@dataclass
class MessageCandidate:
    """Temporary model for detected task from message."""
    text: str
    detected_assignee: Optional[str]
    detected_assignee_id: Optional[int]
    detected_due_date: Optional[datetime]
    confidence: float
    original_message: str

class MessageParsingService:
    """Service for parsing chat messages to detect tasks."""
    
    # Keywords that indicate a task
    TASK_KEYWORDS = [
        'сделать', 'реализовать', 'проверить', 'написать', 'создать',
        'добавить', 'исправить', 'протестировать', 'развернуть', 'настроить',
        'нужно', 'надо', 'необходимо', 'важно', 'срочно',
        'выполнить', 'завершить', 'подготовить', 'обновить'
    ]
    
    # Date patterns
    DATE_PATTERNS = {
        r'завтра': lambda: Clock.now() + timedelta(days=1),
        r'послезавтра': lambda: Clock.now() + timedelta(days=2),
        r'через (\d+) дн[ея]': lambda m: Clock.now() + timedelta(days=int(m.group(1))),
        r'через неделю': lambda: Clock.now() + timedelta(weeks=1),
        r'через месяц': lambda: Clock.now() + timedelta(days=30),
        r'в понедельник': lambda: MessageParsingService._next_weekday(0),
        r'во вторник': lambda: MessageParsingService._next_weekday(1),
        r'в среду': lambda: MessageParsingService._next_weekday(2),
        r'в четверг': lambda: MessageParsingService._next_weekday(3),
        r'в пятницу': lambda: MessageParsingService._next_weekday(4),
        r'в субботу': lambda: MessageParsingService._next_weekday(5),
        r'в воскресенье': lambda: MessageParsingService._next_weekday(6),
    }
    
    @staticmethod
    def _next_weekday(weekday: int) -> datetime:
        """Get next occurrence of weekday (0=Monday, 6=Sunday)."""
        today = Clock.now()
        days_ahead = weekday - today.weekday()
        if days_ahead <= 0:
            days_ahead += 7
        return today + timedelta(days=days_ahead)
    
    def parse_message(self, text: str, entities: Optional[List] = None) -> Optional[MessageCandidate]:
        """
        Parse message and detect if it contains a task.
        
        Args:
            text: Message text
            entities: Telegram message entities (mentions, etc.)
        
        Returns:
            MessageCandidate if task detected, None otherwise
        """
        text_lower = text.lower()
        
        # Check if message contains task keywords
        has_task_keyword = any(keyword in text_lower for keyword in self.TASK_KEYWORDS)
        
        if not has_task_keyword:
            return None
        
        # Extract assignee from @mentions
        detected_assignee, assignee_id = self._extract_assignee(text, entities)
        
        # Extract due date
        due_date = self._extract_due_date(text_lower)
        
        # Calculate confidence
        confidence = self._calculate_confidence(text_lower, detected_assignee, due_date)
        
        if confidence < 0.5:
            return None
        
        # Clean text for task title
        task_text = self._clean_text_for_task(text, detected_assignee)
        
        candidate = MessageCandidate(
            text=task_text,
            detected_assignee=detected_assignee,
            detected_assignee_id=assignee_id,
            detected_due_date=due_date,
            confidence=confidence,
            original_message=text
        )
        
        logger.info(
            "task_candidate_detected",
            text=task_text,
            assignee=detected_assignee,
            confidence=confidence
        )
        
        return candidate
    
    def _extract_assignee(self, text: str, entities: Optional[List]) -> tuple[Optional[str], Optional[int]]:
        """Extract assignee from @mentions."""
        if not entities:
            # Fallback: simple regex
            match = re.search(r'@(\w+)', text)
            if match:
                return match.group(1), None
            return None, None
        
        # Parse Telegram entities
        for entity in entities:
            if entity.type == 'mention':
                offset = entity.offset
                length = entity.length
                username = text[offset+1:offset+length]  # Skip @ symbol
                return username, None
            elif entity.type == 'text_mention':
                user = entity.user
                return user.username or user.first_name, user.id
        
        return None, None
    
    def _extract_due_date(self, text: str) -> Optional[datetime]:
        """Extract due date from text."""
        for pattern, date_func in self.DATE_PATTERNS.items():
            match = re.search(pattern, text)
            if match:
                try:
                    if callable(date_func):
                        if match.groups():
                            return date_func(match)
                        else:
                            return date_func()
                except Exception as e:
                    logger.warning("date_extraction_error", pattern=pattern, error=str(e))
                    continue
        return None
    
    def _calculate_confidence(
        self,
        text: str,
        has_assignee: bool,
        has_due_date: bool
    ) -> float:
        """Calculate confidence score for task detection."""
        confidence = 0.0
        
        # Base confidence for having task keywords (already checked)
        confidence += 0.4
        
        # Bonus for having assignee
        if has_assignee:
            confidence += 0.3
        
        # Bonus for having due date
        if has_due_date:
            confidence += 0.2
        
        # Bonus for having multiple task indicators
        task_indicators = sum(1 for keyword in self.TASK_KEYWORDS if keyword in text)
        if task_indicators > 1:
            confidence += 0.1
        
        return min(confidence, 1.0)
    
    def _clean_text_for_task(self, text: str, assignee: Optional[str]) -> str:
        """Clean message text to extract task title."""
        # Remove @mentions
        cleaned = re.sub(r'@\w+', '', text)
        
        # Remove date phrases
        for pattern in self.DATE_PATTERNS.keys():
            cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE)
        
        # Remove common phrases
        remove_phrases = ['нужно', 'надо', 'необходимо', 'важно']
        for phrase in remove_phrases:
            cleaned = cleaned.replace(phrase, '')
        
        # Clean up whitespace
        cleaned = ' '.join(cleaned.split())
        cleaned = cleaned.strip()
        
        # Capitalize first letter
        if cleaned:
            cleaned = cleaned[0].upper() + cleaned[1:]
        
        return cleaned
