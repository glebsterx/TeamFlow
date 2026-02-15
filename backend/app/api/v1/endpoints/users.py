from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.user import User
from app.schemas.user import User as UserSchema
from app.services.user_service import UserService
from app.api.deps import get_current_user

router = APIRouter()


@router.get("/", response_model=list[UserSchema])
def get_users(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
):
    """Get all users in the team."""
    users = UserService.get_all(db, skip=skip, limit=limit)
    return users


@router.get("/{user_id}", response_model=UserSchema)
def get_user(
    user_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Get user by ID."""
    user = UserService.get_by_id(db, user_id)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return user
