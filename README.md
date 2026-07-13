# NexStore AI 🛍️🤖

NexStore AI is a modern, full-stack e-commerce platform concept built for a portfolio. It demonstrates advanced integration of an AI-powered search system with a sleek, responsive UI.

## 🚀 Features

- **Hybrid AI Search (Demo):** Users can describe what they are looking for in natural language (e.g., "A red sweater for a Christmas party"). The system parses the intent, finds relevant items in the local database, and acts as an aggregator to fetch deals from external platforms (like Amazon/eBay).
- **Modern Tech Stack:** Built with Next.js 16 (App Router), React 19, and Tailwind CSS v4 for maximum performance and DX.
- **Beautiful UI:** Uses `shadcn/ui` for accessible, premium-feeling components. Includes Dark Mode, smooth animations, and a responsive layout.
- **State Management:** Fast and simple global state for the shopping cart using `Zustand` and `LocalStorage`.
- **Database:** Schema ready for `Supabase` (PostgreSQL) with `orders` and `order_items` tables structure.

## 🛠 Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Styling:** Tailwind CSS v4, shadcn/ui
- **State:** Zustand
- **Database:** Supabase (Schema prepared)
- **Icons:** lucide-react

## 📝 Note to Reviewers / Recruiters

This project is a **portfolio showcase**. To ensure it runs smoothly without requiring API keys for third-party services:
- **Search is mocked:** The AI parsing and external API fetching in `/api/search/route.ts` are simulated using timeout delays and keyword-matching. The code for integrating real Gemini/Tavily APIs is included in the file but commented out.
- **Mock Data:** The catalog currently runs on a localized set of mock products (`MOCK_PRODUCTS`) for instant loading.
- **Reviews:** Product reviews are visually mocked to demonstrate layout.

## 🏃‍♂️ Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/SergeyShkryuba/nexstore-ai.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📄 License
MIT License
