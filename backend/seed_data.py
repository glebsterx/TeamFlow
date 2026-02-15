"""
Initial data seeding script
Run: python seed_data.py
"""
import asyncio
from app.core.database import SessionLocal
from app.models.user import User
from app.models.task import Task, TaskStatus, TaskPriority
from app.core.security import get_password_hash
import uuid

def seed_users():
    db = SessionLocal()
    
    # Check if users already exist
    existing = db.query(User).first()
    if existing:
        print("Users already exist, skipping...")
        db.close()
        return
    
    users = [
        User(
            id=uuid.uuid4(),
            email="admin@taskflow.com",
            username="admin",
            hashed_password=get_password_hash("admin123"),
            full_name="Admin User",
            is_active=True
        ),
        User(
            id=uuid.uuid4(),
            email="john@taskflow.com",
            username="john",
            hashed_password=get_password_hash("john123"),
            full_name="John Doe",
            is_active=True
        ),
        User(
            id=uuid.uuid4(),
            email="jane@taskflow.com",
            username="jane",
            hashed_password=get_password_hash("jane123"),
            full_name="Jane Smith",
            is_active=True
        ),
    ]
    
    for user in users:
        db.add(user)
    
    db.commit()
    
    # Add sample tasks
    admin = db.query(User).filter(User.username == "admin").first()
    john = db.query(User).filter(User.username == "john").first()
    jane = db.query(User).filter(User.username == "jane").first()
    
    tasks = [
        Task(
            id=uuid.uuid4(),
            title="Setup development environment",
            description="Install all required tools and dependencies",
            status=TaskStatus.DONE,
            priority=TaskPriority.HIGH,
            creator_id=admin.id,
            assignee_id=john.id
        ),
        Task(
            id=uuid.uuid4(),
            title="Design database schema",
            description="Create ERD and define all tables",
            status=TaskStatus.IN_PROGRESS,
            priority=TaskPriority.HIGH,
            creator_id=admin.id,
            assignee_id=jane.id
        ),
        Task(
            id=uuid.uuid4(),
            title="Implement authentication",
            description="Add JWT-based authentication system",
            status=TaskStatus.TODO,
            priority=TaskPriority.URGENT,
            creator_id=admin.id,
            assignee_id=john.id
        ),
        Task(
            id=uuid.uuid4(),
            title="Create UI mockups",
            description="Design mockups for all main pages",
            status=TaskStatus.TODO,
            priority=TaskPriority.MEDIUM,
            creator_id=admin.id,
            assignee_id=jane.id
        ),
    ]
    
    for task in tasks:
        db.add(task)
    
    db.commit()
    db.close()
    
    print("✅ Database seeded successfully!")
    print("\nTest users created:")
    print("  admin@taskflow.com / admin123")
    print("  john@taskflow.com / john123")
    print("  jane@taskflow.com / jane123")

if __name__ == "__main__":
    seed_users()
