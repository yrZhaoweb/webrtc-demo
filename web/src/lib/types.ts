export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  type?: "user" | "system";
}

export interface ErrorState {
  message: string | null;
  show: boolean;
}

export interface NetworkState {
  isOnline: boolean;
}
