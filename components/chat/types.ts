export type ChatMessage = {
  id: string;
  sender: string;
  text: string;
  own: boolean;
  timestamp?: string | null;
};

export type ActiveChat = {
  id: string;
  name: string;
  email?: string | null;
};
