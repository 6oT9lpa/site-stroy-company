from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_mail import Mail
from sqlalchemy.dialects.postgresql import UUID
from flask_migrate import Migrate
from config import Config
from flask_login import LoginManager, UserMixin, current_user
import pytz
from werkzeug.security import check_password_hash, generate_password_hash
from limiter import limiter
import uuid
from datetime import datetime, timedelta


app = Flask(__name__)
app.config.from_object(Config)

db = SQLAlchemy(app)
migrate = Migrate(app, db)
mail = Mail()
mail.init_app(app)
login_manager = LoginManager(app)
login_manager.init_app(app)

moscow_tz = pytz.timezone('Europe/Moscow')
limiter.init_app(app)

from main import main
app.register_blueprint(main)

class User(db.Model, UserMixin):
    __tablename__ = 'users'
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = db.Column(db.String(64), unique=True)
    email = db.Column(db.String(200), unique=True)
    password_hash = db.Column(db.TEXT)
    first_name = db.Column(db.String(100))
    last_name = db.Column(db.String(100))
    registered_at = db.Column(db.DateTime, default=lambda: datetime.now(moscow_tz))
    last_activity = db.Column(db.DateTime, default=lambda: datetime.now(moscow_tz))
    is_blocked = db.Column(db.Boolean, default=False)
    role_id = db.Column(db.Integer, db.ForeignKey('role.id'))

    role = db.relationship('Role', backref=db.backref('users', lazy=True))
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'registered_at': self.registered_at,
            'last_activity': self.last_activity,
            'is_blocked': self.is_blocked,
            'role_id': self.role_id
        }
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def has_permission(self, permission):
        if self.role and self.role.permissions:
            return permission in self.role.permissions
        return False
    
    def is_admin(self):
        return self.role.is_admin if self.role else False

class Role(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    description = db.Column(db.String(200))
    permissions = db.Column(db.JSON, default=list)
    is_admin = db.Column(db.Boolean, default=False)

class ProvideServices(db.Model):
    __tablename__ = "provide_services"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    description = db.Column(db.Text)
    filter_name = db.Column(db.Integer, db.ForeignKey("filter_list.id"))
    cost = db.Column(db.String(20), nullable=False)
    duraction_work = db.Column(db.String(20), nullable=True)
    materials = db.Column(db.JSON, nullable=True)
    include_service = db.Column(db.JSON, nullable=True)
    
    ft_name = db.relationship('FilterList', backref=db.backref('provide_services', lazy=True))
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'filter_name': self.filter_name,
            'cost': self.cost,
            'duraction_work': self.duraction_work,
            'materials': self.materials,
            'include_service': self.include_service
        }

class FilterList(db.Model):
    __tablename__ = "filter_list" 
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False) 
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name
        }

class ServiceQuestion(db.Model):
    __tablename__ = "service_questions"
    id = db.Column(db.Integer, primary_key=True)
    filter_id = db.Column(db.Integer, db.ForeignKey("filter_list.id"))
    question_text = db.Column(db.String(500), nullable=False)
    is_required = db.Column(db.Boolean, default=False)
    answer_type = db.Column(db.String(20), default='text')
    
    filter = db.relationship('FilterList', backref=db.backref('service_questions', lazy=True))

class Requests(db.Model):
    __tablename__ = "requests"
    id = db.Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = db.Column(db.String(200))
    phone = db.Column(db.String(20), nullable=False)
    full_name = db.Column(db.String(80), nullable=False)
    services = db.Column(db.JSON)
    budget = db.Column(db.String(50)) 
    comments = db.Column(db.Text)
    status = db.Column(db.String(50), default='Новая')  
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    answers = db.Column(db.JSON)  
    consent_personal_data = db.Column(db.Boolean, default=False)
    consent_marketing = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            'id': str(self.id),
            'email': self.email,
            'phone': self.phone,
            'full_name': self.full_name,
            'services': self.services,
            'budget': self.budget,
            'comments': self.comments,
            'status': self.status,
            'answers': self.answers,
            'consent_personal_data': self.consent_personal_data,
            'consent_marketing': self.consent_marketing,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

class VisitorTracking(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    ip_address = db.Column(db.String(45))
    user_agent = db.Column(db.Text)
    visit_date = db.Column(db.DateTime, default=datetime.utcnow)
    page_visited = db.Column(db.String(255))
    referrer = db.Column(db.String(255))
    
    def __repr__(self):
        return f'<Visitor {self.ip_address} at {self.visit_date}>'

with app.app_context():
    db.create_all()
    
    if not Role.query.filter(Role.name.in_(['admin'])).count():
        admin_role = Role(
            name='admin',
            is_admin=True
        )
        
        db.session.add(admin_role)
        db.session.commit()
        print("Роли успешно созданы!")
    else:
        print("Роли уже существуют в базе")
        
    if not User.query.filter_by(username='admin').first():
        new_user = User(
            username="admin",
            email="admin@gmail.com",
            role_id=admin_role.id 
        )  
        new_user.set_password("admin1234")
        db.session.add(new_user)
        db.session.commit()
        print("User был создан!")
    else:
        print("User уже существует в базе")

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(user_id)
