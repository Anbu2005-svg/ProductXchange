"""Step 7c: price suggestion. Heuristic until enough COMPLETED transactions exist to train XGBoost.
Train with: features = category, condition, transaction_type, age-of-listing; target = agreed_price."""
import os
from statistics import median

_model = None
MODEL_PATH = os.getenv("PRICE_MODEL_PATH", "models/price_xgb.json")

def _load():
    global _model
    if _model is None and os.path.exists(MODEL_PATH):
        import xgboost as xgb
        _model = xgb.XGBRegressor(); _model.load_model(MODEL_PATH)
    return _model

def suggest_price(db, category: str, condition: str | None) -> float | None:
    from app.models.transaction import Transaction, TransactionState
    from app.models.product import Product
    rows = (db.query(Transaction.agreed_price).join(Product, Product.id == Transaction.product_id)
            .filter(Product.category == category, Transaction.state == TransactionState.COMPLETED,
                    Transaction.agreed_price.isnot(None)).limit(200).all())
    prices = [r[0] for r in rows]
    return round(median(prices), 2) if len(prices) >= 5 else None
