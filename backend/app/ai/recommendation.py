"""
Step 7e — LightFM: personalized recommendations from interaction history.
Lowest priority in the build order — needs weeks of real search/view/favorite/
buy interaction data to be worth anything. Log interactions from day one
(see log_interaction below) even before this model exists, so training data
is ready when you get here.
"""
import io
import os
import pickle
import logging

logger = logging.getLogger(__name__)

MODEL_PATH = os.getenv("RECOMMENDATION_MODEL_PATH", "/app/ai/models/lightfm_model.pkl")
_model = None

ALLOWED_MODULE_PREFIXES = ("numpy", "lightfm", "scipy")
ALLOWED_BUILTINS = {"dict", "list", "set", "int", "float", "str", "bool", "tuple", "frozenset"}


class SafeModelUnpickler(pickle.Unpickler):
    """Restricts unpickling to known, safe numeric/ML structures to prevent RCE."""
    def find_class(self, module: str, name: str):
        if module == "builtins" and name in ALLOWED_BUILTINS:
            return super().find_class(module, name)
        if any(module == prefix or module.startswith(prefix + ".") for prefix in ALLOWED_MODULE_PREFIXES):
            return super().find_class(module, name)
        raise pickle.UnpicklingError(f"Security violation: Attempted to deserialize untrusted type '{module}.{name}'")


def log_interaction(db, user_id: int, product_id: int, interaction_type: str):
    """
    interaction_type: one of "search" | "view" | "favorite" | "chat" | "buy" | "rent" | "exchange"
    Write to a simple interactions table (add via migration) — this is the training
    data for LightFM later. Keep this call cheap and non-blocking (fire-and-forget
    or push to a queue) since it's on the hot path of every product view.
    """
    pass  # implement once the `interactions` table exists


def get_recommendations(user_id: int, top_n: int = 10) -> list[int]:
    global _model
    if _model is None:
        if not os.path.exists(MODEL_PATH) or not os.path.isfile(MODEL_PATH):
            return []  # no model trained yet — UI should hide the "Recommended for you" section
        try:
            with open(MODEL_PATH, "rb") as f:
                _model = SafeModelUnpickler(f).load()
        except Exception as e:
            logger.error(f"Failed to securely load recommendation model: {e}")
            return []
    # Replace with real LightFM predict() call against your user/item id mappings.
    return []

