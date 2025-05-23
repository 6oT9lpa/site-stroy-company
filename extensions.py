from flask_sqlalchemy import SQLAlchemy
from flask_mail import Mail
from flask_login import LoginManager
from flask_migrate import Migrate
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from redis import Redis

db = SQLAlchemy()
mail = Mail()
login_manager = LoginManager()
migrate = Migrate()

redis = Redis(host='localhost', port=6379, db=0)
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri='redis://localhost:6379'
)

@login_manager.user_loader
def load_user(user_id):
    from models import User
    return User.query.get(user_id)
