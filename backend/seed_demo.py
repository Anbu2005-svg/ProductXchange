"""
ProductXchange — Demo Database Seeding Script
Populates realistic college users, campus listings, negotiations, and reviews
for final year project presentations and live demonstrations.

Usage:
    python backend/seed_demo.py
    python backend/seed_demo.py --sqlite
"""

import sys
import os
import argparse

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="geoalchemy2")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.database import Base, engine as default_engine, is_sqlite
from app.core.security import hash_password
from app.models.user import User
from app.models.product import Product, ProductStatus, TransactionType
from app.models.transaction import Transaction, TransactionState, Offer
from app.models.review import Review


def create_demo_data(db, is_sqlite_mode: bool):
    print("🧹 Cleaning existing demo records...")
    # Clear tables in reverse dependency order
    try:
        db.query(Review).delete()
        db.query(Offer).delete()
        db.query(Transaction).delete()
        db.query(Product).delete()
        db.query(User).delete()
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"   Note during cleanup: {e}")

    print("👤 Creating demo campus users...")
    demo_password_hash = hash_password("Password123!")

    users = [
        User(
            email="anbu@college.edu",
            password_hash=demo_password_hash,
            full_name="Anbuchelvan K",
            college="Kumaraguru College of Technology (KCT), Saravanampatti",
            phone="+919876543210",
            is_verified=True,
            verification_method="college_id",
            latitude=11.0797,
            longitude=76.9997,
            avg_rating=4.9,
            rating_count=14,
        ),
        User(
            email="priya@pes.edu",
            password_hash=demo_password_hash,
            full_name="Priya Sharma",
            college="Sri Ramakrishna Engineering College (SREC), Vattamalaipalayam",
            phone="+919876543211",
            is_verified=True,
            verification_method="phone_otp",
            latitude=11.0854,
            longitude=76.9452,
            avg_rating=4.8,
            rating_count=9,
        ),
        User(
            email="rahul@bmsce.edu",
            password_hash=demo_password_hash,
            full_name="Rahul Nair",
            college="KGiSL Institute of Technology, Saravanampatti",
            phone="+919876543212",
            is_verified=True,
            verification_method="college_id",
            latitude=11.0805,
            longitude=77.0012,
            avg_rating=5.0,
            rating_count=6,
        ),
        User(
            email="kavya@iisc.ac.in",
            password_hash=demo_password_hash,
            full_name="Kavya Murthy",
            college="SNS College of Technology, Saravanampatti",
            phone="+919876543213",
            is_verified=True,
            verification_method="college_id",
            latitude=11.0782,
            longitude=76.9985,
            avg_rating=4.7,
            rating_count=11,
        ),
        User(
            email="admin@productxchange.in",
            password_hash=demo_password_hash,
            full_name="ProductXchange Administrator",
            college="Coimbatore Campus Administration Hub",
            phone="+919876543299",
            is_verified=True,
            is_admin=True,
            verification_method="admin",
            latitude=11.0797,
            longitude=76.9997,
            avg_rating=5.0,
            rating_count=1,
        ),
    ]

    for u in users:
        db.add(u)
    db.commit()
    for u in users:
        db.refresh(u)

    user_map = {u.email: u for u in users}
    print(f"   Created {len(users)} users.")

    print("📚 Creating realistic campus listings...")
    # Helper for geometry point assignment
    def make_loc(lat, lng):
        if is_sqlite_mode:
            return f"{lng}:{lat}"
        return ST_SetSRID(ST_MakePoint(lng, lat), 4326)

    listings_data = [
        {
            "seller": "anbu@college.edu",
            "title": "Casio fx-991EX ClassWiz Scientific Calculator",
            "description": "552 functions, high-resolution natural textbook display. Barely used for 2 semesters of engineering maths. Original box and slide-on hard case included.",
            "category": "Electronics & Gadgets",
            "condition": "Like New",
            "price": 850.0,
            "transaction_type": TransactionType.BUY,
            "lat": 11.0797,
            "lng": 76.9997,
            "pickup_area": "Saravanampatti, Coimbatore (Kumaraguru College Campus Gate 1)",
            "image_urls": ["/uploads/demo/prod_1.jpg", "https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?w=600&auto=format&fit=crop&q=80"],
        },
        {
            "seller": "anbu@college.edu",
            "title": "Engineering Mechanics (Statics & Dynamics) — Timoshenko",
            "description": "5th Edition, McGraw Hill. Clear diagrams, no highlighting or missing pages. Perfect for 1st/2nd year civil and mechanical core papers.",
            "category": "Textbooks & Study Material",
            "condition": "Good",
            "price": 320.0,
            "transaction_type": TransactionType.BUY,
            "lat": 11.0805,
            "lng": 77.0012,
            "pickup_area": "Saravanampatti, Coimbatore (KGiSL Institute of Technology Entrance)",
            "image_urls": ["/uploads/demo/prod_2.jpg", "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80"],
        },
        {
            "seller": "anbu@college.edu",
            "title": "Arduino Mega 2560 R3 + 37 Sensor Modules Starter Kit",
            "description": "Used for our IoT semester mini-project. Includes Mega 2560 board, ultrasonic sensor, RFID reader, LCD 1602, jumper cables, and breadboard.",
            "category": "Lab Equipment & Calculators",
            "condition": "Like New",
            "price": 1250.0,
            "transaction_type": TransactionType.BUY,
            "lat": 11.0782,
            "lng": 76.9985,
            "pickup_area": "Saravanampatti, Coimbatore (SNS College of Technology Hostel Hub)",
            "image_urls": ["/uploads/demo/prod_3.jpg", "https://images.unsplash.com/photo-1553406830-ef2513450d76?w=600&auto=format&fit=crop&q=80"],
        },
        {
            "seller": "priya@pes.edu",
            "title": "Computer Networks: A Top-Down Approach (Kurose & Ross)",
            "description": "Looking to swap this textbook for 'Database System Concepts' by Silberschatz or 'Operating System Concepts' (Dinosaur book). Book is in great condition.",
            "category": "Textbooks & Study Material",
            "condition": "Like New",
            "price": 0.0,
            "transaction_type": TransactionType.EXCHANGE,
            "lat": 11.0810,
            "lng": 77.0020,
            "pickup_area": "Saravanampatti, Coimbatore (Sathy Road / IT Corridor Bus Stop)",
            "image_urls": ["/uploads/demo/prod_4.jpg", "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80"],
        },
        {
            "seller": "priya@pes.edu",
            "title": "Texas Instruments TI-84 Plus CE Color Graphing Calculator",
            "description": "Available for rent during semester exam weeks or project evaluation. High-res backlit color screen, rechargeable battery, cable included.",
            "category": "Electronics & Gadgets",
            "condition": "Like New",
            "price": 150.0,
            "transaction_type": TransactionType.RENT,
            "lat": 11.0792,
            "lng": 76.9990,
            "pickup_area": "Saravanampatti, Coimbatore (KCT Central Library Porch)",
            "image_urls": ["/uploads/demo/prod_5.jpg", "https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?w=600&auto=format&fit=crop&q=80"],
        },
        {
            "seller": "priya@pes.edu",
            "title": "Prestige 1.5L Stainless Steel Electric Kettle",
            "description": "Automatic cutoff, 360-degree swivel base. Lifesaver for late-night hostel study sessions, tea, noodles, and boiling water.",
            "category": "Hostel & Room Essentials",
            "condition": "Good",
            "price": 500.0,
            "transaction_type": TransactionType.BUY,
            "lat": 11.0775,
            "lng": 76.9970,
            "pickup_area": "Saravanampatti, Coimbatore (Saravanampatti Junction Food Street)",
            "image_urls": ["/uploads/demo/prod_6.jpg", "https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=600&auto=format&fit=crop&q=80"],
        },
        {
            "seller": "rahul@bmsce.edu",
            "title": "Hero Sprint 26T 21-Speed Gear Bicycle",
            "description": "All Shimano gears smooth and tuned last month. Front disc brake, sturdy frame, ideal for campus commute between hostel and main building. Includes combination lock.",
            "category": "Cycles & Mobility",
            "condition": "Good",
            "price": 3800.0,
            "transaction_type": TransactionType.BUY,
            "lat": 11.0854,
            "lng": 76.9452,
            "pickup_area": "Vattamalaipalayam, Coimbatore (Sri Ramakrishna Engineering College Main Entrance)",
            "image_urls": ["/uploads/demo/prod_7.jpg", "https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=600&auto=format&fit=crop&q=80"],
        },
        {
            "seller": "rahul@bmsce.edu",
            "title": "Engineering Graphics Mini-Drafter with Steel Clamp & Scales",
            "description": "Donating for free to any 1st year student who needs it for Engineering Drawing lab. Unbroken scales, smooth rotating protractor head.",
            "category": "Lab Equipment & Calculators",
            "condition": "Good",
            "price": 0.0,
            "transaction_type": TransactionType.DONATE,
            "lat": 11.0860,
            "lng": 76.9460,
            "pickup_area": "Vattamalaipalayam, Coimbatore (SREC Workshop Building & Mech Block)",
            "image_urls": ["/uploads/demo/prod_8.jpg", "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=600&auto=format&fit=crop&q=80"],
        },
        {
            "seller": "rahul@bmsce.edu",
            "title": "White Unisex College Chemistry / Bio Lab Coat (Size L)",
            "description": "100% thick white cotton with 3 front pockets and back vent. Freshly washed, no chemical stains. Fits height 5'7 to 6'0.",
            "category": "Lab Equipment & Calculators",
            "condition": "Like New",
            "price": 220.0,
            "transaction_type": TransactionType.BUY,
            "lat": 11.0850,
            "lng": 76.9448,
            "pickup_area": "Vattamalaipalayam, Coimbatore (SREC Library & Chemistry Lab Floor 2)",
            "image_urls": ["/uploads/demo/prod_9.jpg", "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600&auto=format&fit=crop&q=80"],
        },
        {
            "seller": "kavya@iisc.ac.in",
            "title": "Raspberry Pi 4 Model B (4GB RAM) + Official USB-C Power Supply",
            "description": "Includes official red/white case, 3 copper heatsinks, micro-HDMI to HDMI adapter, and 32GB SanDisk Ultra MicroSD pre-flashed with Raspberry Pi OS.",
            "category": "Electronics & Gadgets",
            "condition": "Like New",
            "price": 3400.0,
            "transaction_type": TransactionType.BUY,
            "lat": 11.0830,
            "lng": 76.9420,
            "pickup_area": "Vattamalaipalayam, Coimbatore (NGGO Colony / Thudiyalur Junction)",
            "image_urls": ["/uploads/demo/prod_10.jpg", "https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop&q=80"],
        },
        {
            "seller": "kavya@iisc.ac.in",
            "title": "Foldable Ergonomic Study Laptop Table for Hostel Bed",
            "description": "High-density wood top with tablet slot, cup holder, and non-slip rubber legs. Lightweight and folds completely flat.",
            "category": "Hostel & Room Essentials",
            "condition": "Good",
            "price": 380.0,
            "transaction_type": TransactionType.BUY,
            "lat": 11.0865,
            "lng": 76.9470,
            "pickup_area": "Vattamalaipalayam, Coimbatore (Sri Ramakrishna Hostels Entrance)",
            "image_urls": ["/uploads/demo/prod_11.jpg", "https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=600&auto=format&fit=crop&q=80"],
        },
        {
            "seller": "kavya@iisc.ac.in",
            "title": "GATE Computer Science 15-Year Chapterwise Solved Papers",
            "description": "Made Easy publication book with detailed explanatory solutions and mock test papers. Free to whoever is preparing for GATE 2026/2027.",
            "category": "Textbooks & Study Material",
            "condition": "Good",
            "price": 0.0,
            "transaction_type": TransactionType.DONATE,
            "lat": 11.0845,
            "lng": 76.9440,
            "pickup_area": "Vattamalaipalayam, Coimbatore (Vattamalaipalayam Bus Stop)",
            "image_urls": ["/uploads/demo/prod_12.jpg", "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=600&auto=format&fit=crop&q=80"],
        },
    ]

    created_products = []
    for idx, item in enumerate(listings_data):
        seller_user = user_map[item["seller"]]
        local_img = f"/uploads/demo/prod_{idx + 1}.jpg"
        p = Product(
            seller_id=seller_user.id,
            title=item["title"],
            description=item["description"],
            category=item["category"],
            condition=item["condition"],
            price=item["price"],
            transaction_type=item["transaction_type"],
            latitude=item["lat"],
            longitude=item["lng"],
            location=make_loc(item["lat"], item["lng"]),
            pickup_area=item["pickup_area"],
            image_urls=[local_img] + item["image_urls"],
            status=ProductStatus.ACTIVE,
        )
        db.add(p)
        created_products.append(p)

    db.commit()
    for p in created_products:
        db.refresh(p)
    print(f"   Created {len(created_products)} active listings.")

    print("🤝 Seeding demonstration negotiations & state machine deals...")
    # Deal 1: Priya made offer on Anbu's Casio calculator (PENDING - waiting for Anbu to accept/counter)
    p_casio = created_products[0]
    tx_pending = Transaction(
        product_id=p_casio.id,
        buyer_id=user_map["priya@pes.edu"].id,
        seller_id=user_map["anbu@college.edu"].id,
        state=TransactionState.PENDING,
        agreed_price=750.0,
        notes="Can pickup from RVCE main gate today after 4 PM lab class.",
    )
    db.add(tx_pending)
    db.commit()
    db.refresh(tx_pending)

    db.add(Offer(
        transaction_id=tx_pending.id,
        proposed_by_id=user_map["priya@pes.edu"].id,
        amount=750.0,
        message="Can pickup from RVCE main gate today after 4 PM lab class.",
    ))
    db.commit()

    # Deal 2: Rahul and Anbu deal on Timoshenko Mechanics (CONFIRMED - pickup location UNLOCKED!)
    p_timoshenko = created_products[1]
    tx_confirmed = Transaction(
        product_id=p_timoshenko.id,
        buyer_id=user_map["rahul@bmsce.edu"].id,
        seller_id=user_map["anbu@college.edu"].id,
        state=TransactionState.CONFIRMED,
        agreed_price=280.0,
        notes="Confirmed meetup for tomorrow morning before class.",
        buyer_completed=True,  # Buyer already signed off
        seller_completed=False, # Seller sign-off pending
    )
    db.add(tx_confirmed)
    db.commit()
    db.refresh(tx_confirmed)

    db.add(Offer(
        transaction_id=tx_confirmed.id,
        proposed_by_id=user_map["rahul@bmsce.edu"].id,
        amount=280.0,
        message="Would ₹280 work? I can come by RVCE on my bike.",
    ))
    db.commit()

    # Deal 3: Completed deal between Anbu and Priya for Electric Kettle (COMPLETED with 5-star review!)
    p_kettle = created_products[5]
    p_kettle.status = ProductStatus.SOLD
    tx_completed = Transaction(
        product_id=p_kettle.id,
        buyer_id=user_map["anbu@college.edu"].id,
        seller_id=user_map["priya@pes.edu"].id,
        state=TransactionState.COMPLETED,
        agreed_price=480.0,
        notes="Handover completed at PESU canteen.",
        buyer_completed=True,
        seller_completed=True,
    )
    db.add(tx_completed)
    db.commit()
    db.refresh(tx_completed)

    db.add(Review(
        transaction_id=tx_completed.id,
        reviewer_id=user_map["anbu@college.edu"].id,
        reviewee_id=user_map["priya@pes.edu"].id,
        rating=5,
        comment="Super punctual handover near PESU mess hall! The kettle is clean and works great.",
    ))
    db.commit()
    print("   Created active, confirmed, and completed deals with negotiation history.")

    print("\n" + "=" * 65)
    print("🎉 DEMO DATABASE SEEDED SUCCESSFULLY!")
    print("=" * 65)
    print("Demo User Accounts (Password for all accounts: Password123!)")
    print(" • anbu@college.edu      (Student Seller / RVCE Bangalore)")
    print(" • priya@pes.edu         (Student Buyer / PES University)")
    print(" • rahul@bmsce.edu       (Student Buyer / BMSCE)")
    print(" • kavya@iisc.ac.in      (Student Seller / IISc Bangalore)")
    print(" • admin@productxchange.in (Platform Administrator)")
    print("=" * 65)
    print("Presentation Highlights Ready to Show:")
    print(" 1. Proximity Feed: 12 real items placed around Bangalore college hubs.")
    print(" 2. Location Privacy: Confirmed deal unlocks pickup location, others blurred.")
    print(" 3. Deals Dashboard: Live negotiation offers, counter-offers & completion sign-off.")
    print("=" * 65 + "\n")


def main():
    if settings.ENV == "production" and not os.environ.get("FORCE_DEMO_SEED"):
        print("❌ ERROR: Demo seeding is strictly prohibited in production environment.")
        print("To override deliberately, set environment variable FORCE_DEMO_SEED=1")
        sys.exit(1)

    parser = argparse.ArgumentParser(description="Seed ProductXchange Demo Data")
    parser.add_argument(
        "--sqlite",
        action="store_true",
        help="Force use of local SQLite database (productxchange.db)",
    )
    args = parser.parse_args()

    engine = default_engine
    is_sqlite_mode = is_sqlite or args.sqlite

    if args.sqlite or is_sqlite:
        sqlite_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "productxchange.db")
        print(f"📦 Seeding local SQLite database at: {sqlite_path}")
        from app.core.database import create_engine as ce, register_sqlite_functions
        engine = ce(
            f"sqlite:///{sqlite_path}",
            connect_args={"check_same_thread": False},
        )
        register_sqlite_functions(engine.raw_connection(), None)
        is_sqlite_mode = True
    else:
        # Check if PostgreSQL connection succeeds
        try:
            conn = engine.connect()
            conn.close()
            print(f"🐘 Connected to PostgreSQL: {settings.DATABASE_URL.split('@')[-1]}")
        except Exception as e:
            print("⚠️ PostgreSQL is not reachable at configured DATABASE_URL.")
            print("💡 Automatically switching to local SQLite (productxchange.db) for demo!")
            sqlite_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "productxchange.db")
            from app.core.database import create_engine as ce
            engine = ce(
                f"sqlite:///{sqlite_path}",
                connect_args={"check_same_thread": False},
            )
            is_sqlite_mode = True

    # Ensure tables exist
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        create_demo_data(db, is_sqlite_mode=is_sqlite_mode)
    finally:
        db.close()


if __name__ == "__main__":
    main()
