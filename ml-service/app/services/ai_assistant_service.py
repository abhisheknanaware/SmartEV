import os
import re
from typing import Dict, Any, List
from app.schemas.ai_assistant_schemas import ChatRequest, ChatResponse
from app.services.rag_engine import rag_engine

class AIAssistantService:
    def __init__(self):
        self.rag_engine = rag_engine

    def process_chat(self, req: ChatRequest) -> ChatResponse:
        """
        Processes conversational request using Retrieval-Augmented Generation (RAG).
        Retrieves relevant domain knowledge chunks from the vector corpus and synthesizes
        grounded responses with tool calls and citations.
        """
        return self.rag_engine.generate(req)

ai_assistant_service = AIAssistantService()
