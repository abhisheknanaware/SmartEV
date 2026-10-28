from pydantic import BaseModel
from typing import List, Dict, Optional, Any

class ChatMessage(BaseModel):
    role: str # "user" or "assistant" or "system"
    content: str

class ChatRequest(BaseModel):
    message: str
    conversation_history: List[ChatMessage] = []
    user_context: Optional[Dict[str, Any]] = None # current location, vehicle, battery level, current route

class ToolCallPayload(BaseModel):
    name: str
    arguments: Dict[str, Any]

class ChatResponse(BaseModel):
    reply: str
    tool_executed: Optional[str] = None
    tool_arguments: Optional[Dict[str, Any]] = None
    tool_result: Optional[Dict[str, Any]] = None
    action_type: Optional[str] = None # e.g. "SHOW_ROUTE", "SHOW_STATION", "PROMPT_BOOKING", "NAVIGATE"
    suggested_quick_replies: List[str] = []
    retrieved_sources: Optional[List[str]] = None
    is_rag: bool = True
