from flask import Flask
from config import Config
from extensions import db, mail, login_manager, migrate, limiter
from datetime import datetime
from zoneinfo import ZoneInfo

moscow_tz = ZoneInfo('Europe/Moscow')

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    mail.init_app(app)
    login_manager.init_app(app)
    migrate.init_app(app, db)
    limiter.init_app(app)

    from main import main
    app.register_blueprint(main)

    with app.app_context():
        db.create_all()
        create_initial_data()

    return app

def create_initial_data():
    from models import Role, User
    
    if not Role.query.filter(Role.name.in_(['admin', 'manager', 'tech', 'moderator'])).count():
        roles = [
            Role(name='admin', is_admin=True),
            Role(name='moder'),
            Role(name='tech'),
            Role(name='manager')
        ]
        db.session.add_all(roles)
        db.session.commit()

    if not User.query.filter_by(username='admin').first():
        admin_role = Role.query.filter_by(name='admin').first()
        admin = User(
            username="admin",
            email="admin@gmail.com",
            role_id=admin_role.id
        )
        admin.set_password("admin1234")
        db.session.add(admin)
        db.session.commit()
        


