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

export type DbMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  ciphertext: string;
  nonce: string;
  header: Record<string, unknown>;
  message_type: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
};
