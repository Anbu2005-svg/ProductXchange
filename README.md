# ProductXchange

> **Location-Based Peer-to-Peer Student Marketplace**  
> *Final Year Engineering Project — Anbu*

ProductXchange is a location-first peer-to-peer marketplace tailored specifically for college student communities. It facilitates buying, selling, exchanging, renting, and donating academic and campus essentials (textbooks, lab equipment, calculators, electronics, project components) with built-in privacy protection, proximity discovery, local database authentication, and negotiation workflows.

---

## Key Features & Highlights

- **Proximity-Based Discovery**: Instant geospatial distance sorting and filtering powered by spatial Haversine algorithms.
- **Privacy-by-Design Architecture**:
  - Exact pickup locations (`pickup_area`) are masked and only revealed once a transaction is explicitly **CONFIRMED**.
  - Public listing coordinates are blurred (~1.1 km resolution) to protect student dorm and residential privacy.
- **Offer & Negotiation State Machine**:
  - Multi-stage transaction pipeline: `PENDING` ➔ `COUNTERED` ➔ `ACCEPTED` ➔ `CONFIRMED` ➔ `COMPLETED` / `CANCELLED`.
  - Strict counterparty authorization: users cannot accept, reject, or counter their own offers.
  - Double-party completion sign-off: both buyer and seller must confirm handover with a secure handshake PIN before the transaction moves to `COMPLETED` and the listing is marked `SOLD`.
- **Trust & Safety Enforcement**:
  - User reporting and mutual blocking system.
  - Blocked users and suspended accounts are automatically filtered out of all search feeds and listing pages.
  - Native password hashing using salted bcrypt and secure JWT authentication via `httpOnly` cookies.
- **Local SQLite Database & Offline Image Storage**:
  - Zero external dependencies: pure local SQLite database (`productxchange.db`) with 1-click demo login.
  - Local product image uploads and caching in `backend/uploads/` with graceful SVG category fallbacks.

---

## Tech Stack

| Component | Technology |
|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| **Backend API** | FastAPI, Python 3.12, Uvicorn, Pydantic v2 |
| **Database & ORM** | SQLite 3 (`productxchange.db`), SQLAlchemy 2.0 |
| **Authentication** | Salted bcrypt passwords, JWT tokens, httpOnly cookies |
| **Storage** | Local disk media storage (`backend/uploads/`) |
| **Testing** | Pytest, HTTPX |

---

## Running Locally

### 1. Prerequisites
- **Python 3.12+**
- **Node.js 18+ & npm**

### 2. Backend Setup
1. Open a terminal in the project root:
   ```powershell
   # Activate Python virtual environment
   .\venv\Scripts\Activate.ps1    # On Windows PowerShell
   # source venv/bin/activate     # On Linux / macOS

   # Install dependencies (if needed)
   pip install -r backend/requirements.txt
   ```

2. Seed Demo Data (optional, pre-loads campus users & listings):
   ```powershell
   python backend/seed_demo.py --sqlite
   ```
   Pre-loads verified student accounts (`anbu@college.edu`, `priya@pes.edu`, etc. with password `Password123!`), 12 realistic campus listings with photos, and active negotiation deals.

3. Run the backend API server:
   ```powershell
   python -m uvicorn app.main:app --app-dir backend --reload --port 8000
   ```
   - **Interactive API Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)
   - **Health Endpoint**: [http://localhost:8000/health](http://localhost:8000/health)

### 3. Frontend Setup
1. In a separate terminal, navigate to the `frontend` folder:
   ```bash
   cd frontend
   npm run dev
   ```
2. Open your browser at [http://localhost:3000](http://localhost:3000).
3. On the login page, you can use the **1-Click Local Accounts** selector or enter any registered credentials. Default password for seeded accounts is `Password123!`.

---

## Running Automated Tests

```powershell
.\venv\Scripts\pytest backend\tests -v
```

---

## Project Structure

```
productxchange/
├── backend/
│   ├── app/
│   │   ├── ai/               # Listing assistance and pricing heuristics
│   │   ├── core/             # Configuration, database engine & security/auth
│   │   ├── models/           # SQLAlchemy database models
│   │   ├── routers/          # API route endpoints (auth, products, transactions, etc.)
│   │   ├── schemas/          # Pydantic data validation schemas
│   │   └── services/         # State machine & business logic services
│   ├── tests/                # Automated pytest test suite
│   ├── uploads/              # Local media & uploaded product photos
│   ├── productxchange.db     # Local SQLite database
│   └── requirements.txt      # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── app/              # Next.js App Router pages (browse, details, login, admin)
│   │   ├── components/       # Reusable UI components
│   │   └── lib/              # Client API helper & authentication utilities
│   ├── package.json          # Node dependencies & build scripts
│   └── tailwind.config.js    # Design system configuration
```

---

## Author

**Anbu**  
Final Year Project — ProductXchange
