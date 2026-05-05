# DRDH

DRDH is a secure chat prototype built with Next.js, React, and Supabase. It combines Supabase Auth, profile storage, realtime message delivery, and a browser-side encryption pipeline based on X3DH and a Double Ratchet style session flow.

The important idea behind this project is that message keys are created and advanced in the browser, while Supabase stores public key material, user records, and encrypted message payloads.

## What the app does

- Authenticates users with Supabase email/password auth
- Creates a user profile entry for each authenticated user
- Generates device-local identity keys and prekeys in the browser
- Uploads only public key material to Supabase
- Encrypts messages before inserting them into the `messages` table
- Subscribes to Supabase realtime inserts and decrypts incoming messages locally

## Tech stack

- Next.js 16 App Router
- React 19
- TypeScript
- Supabase SSR + browser clients
- `@noble/curves` for cryptographic primitives
- `idb-keyval` for browser-side key/session storage
- Tailwind CSS 4

## Project structure

```text
app/
  page.tsx                Login entry
  signup/page.tsx         Signup entry
  chat/page.tsx           Server-rendered chat shell
components/
  auth/                   Login, signup, signout UI
  chat/                   Contact list, chat window, send input, chat room logic
lib/
  chat/messages.ts        Encrypt/decrypt orchestration
  crypto/                 X3DH, ratchets, key derivation, encryption helpers
  storage/                IndexedDB-backed local key/session storage
  supabase/               Server and browser Supabase clients
middleware.ts             Route protection and auth redirects
```

## Environment setup

Create a `.env.local` file in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

The code expects these Supabase tables to exist:

- `profiles`
- `messages`
- `identity_keys`
- `signed_prekeys`
- `one_time_prekeys`

The app also expects Supabase Auth to be enabled for email/password sign-in.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## End-to-end project flow

### 1. Routing and session guard

- `middleware.ts` checks the Supabase auth session on every request to `/`, `/signup`, and `/chat`.
- Unauthenticated users are redirected away from `/chat`.
- Authenticated users are redirected away from `/` and `/signup` into `/chat`.

### 2. Login and signup

- `app/page.tsx` renders the login form if no user session exists.
- `app/signup/page.tsx` renders the signup form if no user session exists.
- `components/auth/LoginForm.tsx` signs the user in with Supabase Auth, then immediately runs local crypto setup before navigating to `/chat`.
- `components/auth/SignupForm.tsx` creates the auth user, upserts a profile row, runs local crypto setup, and then navigates to `/chat`.

### 3. Profile creation

- `lib/supabase/profile.ts` derives a display name and username from the auth user.
- `ensureProfile(...)` upserts the record into `profiles`.
- `app/chat/page.tsx` also calls `ensureProfile(...)` so an existing user always has a profile row before chat data is loaded.

### 4. Local crypto bootstrap

When a user logs in, `ensureCryptoSetupForCurrentUser()` runs from `lib/crypto/setup.ts`.

That setup does three things:

- Ensures identity keypairs exist locally
- Ensures a signed prekey and one-time prekeys exist locally
- Resets stored ratchet sessions when the local session-state version changes

Local private material is stored in IndexedDB through:

- `lib/storage/keyStore.ts`
- `lib/storage/sessionStore.ts`

Public material is uploaded to Supabase through:

- `identity_keys`
- `signed_prekeys`
- `one_time_prekeys`

## Secure messaging flow

### A. Opening the chat page

`app/chat/page.tsx` is a server component that:

- Gets the authenticated user
- Loads all other users from `profiles`
- Loads all messages where the current user is sender or receiver
- Filters messages down to the active contact
- Renders the chat layout with `ConversationList` and `ChatRoom`

### B. Preparing the active conversation

`components/chat/ChatRoom.tsx` is the main client-side controller for a conversation.

On mount or contact change it:

- Ensures local crypto is ready
- Rebuilds a seen-message cache
- Calls `decryptConversationMessages(...)`
- Converts database rows into UI messages for `ChatWindow`

If no ratchet session is already stored, the history decryptor tries to bootstrap one from the first incoming `double_ratchet_initial` message in the thread.

### C. First message to a contact

When a user sends a message to a contact for the first time:

1. `encryptMessageForPeer(...)` asks `getOrCreateX3DHSessionAsSender(...)` for a session.
2. If no session exists, `lib/crypto/x3dh.ts` fetches the peer's public prekey bundle from Supabase.
3. The sender verifies the peer's signed prekey signature.
4. The sender derives a shared root key using the X3DH exchanges.
5. A symmetric ratchet session is created and stored locally.
6. The first outgoing message includes a `double_ratchet_initial` header carrying the X3DH bootstrap information plus the ratchet header.

### D. Sending later messages

For later messages in the same conversation:

1. The existing local session is loaded from IndexedDB.
2. The sending chain advances to derive a fresh message key.
3. The plaintext is encrypted locally.
4. The encrypted payload, nonce, header, and message type are inserted into the `messages` table.

No plaintext message body is written to Supabase for ratcheted messages.

### E. Receiving a message

`ChatRoom.tsx` opens a Supabase realtime subscription on the `messages` table.

On each inserted row:

1. The app checks whether the row belongs to the currently open conversation.
2. If it is an incoming encrypted message, `decryptIncomingMessage(...)` is called.
3. If needed, the receiver reconstructs or refreshes the session from the initial X3DH header.
4. If the sender's ratchet public key changed, the receiving DH ratchet step runs.
5. The receiving chain advances, a message key is derived, and the ciphertext is decrypted locally.
6. The decrypted text is appended to the chat UI.

### F. Replaying history

`decryptConversationMessages(...)` walks through the conversation in timestamp order and replays the ratchet state forward so previously stored encrypted messages can be shown again after refresh.

It also handles older fallback message types:

- `text`
- `dev_encrypted`
- `double_ratchet_initial`
- `double_ratchet`

## Storage model

### Supabase stores

- Auth users and sessions
- `profiles` rows for contact discovery
- Public key material needed for session bootstrap
- Encrypted message records

### Browser stores

- Identity private keys
- Signed prekey private key
- One-time prekey private keys
- Per-peer ratchet sessions
- A local session-state version flag in `localStorage`

## Important implementation notes

- The browser's local prekey inventory is treated as authoritative and is re-uploaded during setup.
- One-time prekey claiming is currently disabled in the X3DH fetch path, even though the schema and local generation support it.
- Chat history decryption depends on replaying the stored ratchet state in message order.
- If local crypto state changes format, `SESSION_STATE_VERSION` in `lib/crypto/setup.ts` clears stored sessions for that user.

## Key files to read first

- `app/chat/page.tsx`
- `components/chat/ChatRoom.tsx`
- `lib/chat/messages.ts`
- `lib/crypto/x3dh.ts`
- `lib/crypto/setup.ts`
- `lib/storage/sessionStore.ts`

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```
