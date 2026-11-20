# Skiller Whale, Generative AI for Everyone: Medley

This repo holds the tools for the Skiller Whale session Generative AI for Everyone: Medley.
They are meant to run in the hosted environment that Skiller Whale provides during the session, so you don't need to install or set up anything yourself.

- **Chat** (<http://localhost:1001>): a plain chatbot on a basic language model, for the Strong or Weak exercise. Open <http://localhost:1001/?tools> to offer a calculator tool on new chats. The app is in `chat/`, and `chat-config.json` sets its model and suggested prompts.
- **Agent workspace** (<http://localhost:1002>): a workspace modelled on agents like Claude Cowork, for the Give It a Try exercise. See `workspace/README.md`.

To try the chat locally without the Bedrock proxy, run `cd chat && bun install && bun run dev`, and open <http://localhost:3000>.
