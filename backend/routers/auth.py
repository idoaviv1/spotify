"""Authentication router - Handles login, current user profile, and self password updates."""
import logging
import time
from collections import defaultdict
from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db, User
from auth import verify_password, hash_password, create_access_token, get_current_user

logger = logging.getLogger("homeify.auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])

# Rate limiter for failed login attempts (sliding window per IP)
_failed_login_attempts: dict[str, list[float]] = defaultdict(list)
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_WINDOW_SECONDS = 60.0


def _check_rate_limit(client_ip: str):
    now = time.time()
    attempts = _failed_login_attempts[client_ip]
    valid_attempts = [t for t in attempts if now - t < LOCKOUT_WINDOW_SECONDS]
    _failed_login_attempts[client_ip] = valid_attempts
    if len(valid_attempts) >= MAX_FAILED_ATTEMPTS:
        retry_after = int(LOCKOUT_WINDOW_SECONDS - (now - valid_attempts[0]))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Please try again in {max(1, retry_after)} seconds.",
            headers={"Retry-After": str(max(1, retry_after))},
        )


def _record_failed_attempt(client_ip: str):
    _failed_login_attempts[client_ip].append(time.time())


def _clear_failed_attempts(client_ip: str):
    _failed_login_attempts.pop(client_ip, None)


class LoginRequest(BaseModel):
    username: str
    password: str


class UpdateProfileRequest(BaseModel):
    display_name: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = Field(None, min_length=6)


@router.post("/login")
async def login(
    req: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Authenticate user and issue signed JWT access token with brute-force rate limiting."""
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    username = req.username.strip().lower()
    user = db.query(User).filter(func.lower(User.username) == username).first()

    if not user or not verify_password(req.password, user.password_hash):
        _record_failed_attempt(client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated. Please contact an administrator.",
        )

    _clear_failed_attempts(client_ip)

    token = create_access_token({
        "sub": user.id,
        "username": user.username,
        "role": user.role,
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user.to_dict(),
    }


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Get the profile of the currently logged-in user."""
    return {"user": current_user.to_dict()}


@router.put("/profile")
async def update_profile(
    req: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Allow user to update their display name or change their own password."""
    if req.display_name is not None:
        current_user.display_name = req.display_name.strip()

    if req.new_password:
        if not req.current_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is required to set a new password",
            )
        if not verify_password(req.current_password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password verification failed",
            )
        current_user.password_hash = hash_password(req.new_password)

    db.commit()
    db.refresh(current_user)
    return {"status": "updated", "user": current_user.to_dict()}
