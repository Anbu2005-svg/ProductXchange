from typing import Dict, Set, Any
import json
import logging
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages real-time WebSocket connections for chat conversations and live notifications."""

    def __init__(self):
        # Maps conversation_id -> set of active WebSockets
        self.chat_connections: Dict[int, Set[WebSocket]] = {}
        # Maps user_id -> set of active notification WebSockets
        self.user_connections: Dict[int, Set[WebSocket]] = {}

    async def connect_chat(self, conversation_id: int, websocket: WebSocket):
        await websocket.accept()
        if conversation_id not in self.chat_connections:
            self.chat_connections[conversation_id] = set()
        self.chat_connections[conversation_id].add(websocket)
        logger.info(f"WebSocket connected to chat {conversation_id}. Total: {len(self.chat_connections[conversation_id])}")

    def disconnect_chat(self, conversation_id: int, websocket: WebSocket):
        if conversation_id in self.chat_connections:
            self.chat_connections[conversation_id].discard(websocket)
            if not self.chat_connections[conversation_id]:
                del self.chat_connections[conversation_id]
        logger.info(f"WebSocket disconnected from chat {conversation_id}")

    async def broadcast_chat(self, conversation_id: int, message_data: Dict[str, Any]):
        """Broadcast a chat message to all connected peers in this conversation."""
        if conversation_id not in self.chat_connections:
            return

        payload = json.dumps(message_data, default=str)
        dead_sockets = set()
        for ws in list(self.chat_connections[conversation_id]):
            try:
                await ws.send_text(payload)
            except Exception as e:
                logger.warning(f"Error sending to chat socket: {e}")
                dead_sockets.add(ws)

        for dead in dead_sockets:
            self.disconnect_chat(conversation_id, dead)

    async def connect_user(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.user_connections:
            self.user_connections[user_id] = set()
        self.user_connections[user_id].add(websocket)
        logger.info(f"User {user_id} connected to notification WebSocket.")

    def disconnect_user(self, user_id: int, websocket: WebSocket):
        if user_id in self.user_connections:
            self.user_connections[user_id].discard(websocket)
            if not self.user_connections[user_id]:
                del self.user_connections[user_id]
        logger.info(f"User {user_id} disconnected from notification WebSocket.")

    async def send_user_notification(self, user_id: int, notification_data: Dict[str, Any]):
        """Push an instant alert or deal notification to a specific user."""
        if user_id not in self.user_connections:
            return

        payload = json.dumps(notification_data, default=str)
        dead_sockets = set()
        for ws in list(self.user_connections[user_id]):
            try:
                await ws.send_text(payload)
            except Exception as e:
                logger.warning(f"Error sending notification to user {user_id}: {e}")
                dead_sockets.add(ws)

        for dead in dead_sockets:
            self.disconnect_user(user_id, dead)


manager = ConnectionManager()
