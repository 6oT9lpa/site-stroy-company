from flask import render_template, redirect, url_for, request, Blueprint, jsonify
from flask_login import login_user, login_required, logout_user, current_user
import os, json, uuid
from uuid import UUID
from datetime import datetime, timedelta
from collections import defaultdict
from flask_mail import Message
from werkzeug.utils import secure_filename

from models import User, Role, ProvideServices, FilterList, ServiceQuestion, Requests, VisitorTracking, BlockedContact
from __init__ import db, login_manager, limiter, mail, moscow_tz

main = Blueprint('main', __name__)

def allowed_file(filename):
    from __init__ import create_app
    app = create_app()
    return '.' in filename and \
        filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def check_access(required_role):
    def decorator(f):
        from functools import wraps
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not current_user.is_authenticated or current_user.is_blocked:
                return jsonify({'success': False, 'message': 'Доступ запрещен'}), 403
            
            if not hasattr(current_user, 'role') or not current_user.role:
                return jsonify({'success': False, 'message': 'Роль не назначена'}), 403
            
            if current_user.role.name == 'admin':
                return f(*args, **kwargs)
            elif current_user.role.name == 'tech' and required_role != 'admin':
                return f(*args, **kwargs)
            elif current_user.role.name == 'moder' and required_role in ['moder', 'manager']:
                return f(*args, **kwargs)
            elif current_user.role.name == 'manager' and required_role == 'manager':
                return f(*args, **kwargs)
            
            return jsonify({'success': False, 'message': 'Недостаточно прав'}), 403
        return decorated_function
    return decorator

@main.before_request
def track_visitor():
    if request.path != '/':
        return
    
    ip_address = request.headers.get('X-Forwarded-For', request.remote_addr)
    if ',' in ip_address:
        ip_address = ip_address.split(',')[0].strip()
    
    last_visit = VisitorTracking.query.filter_by(ip_address=ip_address)\
        .order_by(VisitorTracking.visit_date.desc()).first()
    
    if last_visit and (datetime.now() - last_visit.visit_date) < timedelta(minutes=10):
        return
    
    visitor = VisitorTracking(
        ip_address=ip_address,
        user_agent=request.user_agent.string,
        page_visited='/',  
        referrer=request.referrer
    )
    
    try:
        db.session.add(visitor)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"Failed to track visitor: {str(e)}")

@main.errorhandler(401)
def unauthorized_handler(e):
    return redirect(url_for('main.login'))

@limiter.limit("10 per minute")
@main.route('/', methods=['GET'])
def index():
    nonce = os.urandom(16).hex()
    services = ProvideServices.query.all()
    return render_template('index.html', nonce=nonce, services=services)

@main.route('/get_services_for_main_page', methods=['GET'])
def get_services_for_main_page():
    try:
        filters = FilterList.query.all()
        
        services_by_filter = {}
        for filter_item in filters:
            services = ProvideServices.query.filter_by(filter_name=filter_item.id).all()
            services_by_filter[filter_item.name] = [service.to_dict() for service in services]
        
        return jsonify({
            "success": True,
            "filters": [filter.name for filter in filters],
            "services_by_filter": services_by_filter
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

@limiter.limit("10 per minute")
@main.route('/login', methods=['GET'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('main.admin_board', user_id=current_user.id))
    
    return render_template('login.html')

@limiter.limit("3 per minute")
@main.route('/authtificated_user', methods=['POST']) 
def authtificated_user(): 
    if current_user.is_authenticated:
        return redirect(url_for('main.admin_board', user_id=current_user.id))
    data = request.get_json()
    
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({
            "success": False,
            "message": "Неверные данные для входа."
        }), 401
        
    user = User.query.filter_by(username=username).first()
    
    if not user:
        return jsonify({
            "success": False,
            "message": "Пользователь не найден."
        }), 401

    if user.is_blocked:
        return jsonify({
            "success": False,
            "message": "Ваш аккаунт был заблокирован администратором."
        }), 403
        
    if user.check_password(password):
        login_user(user)
        next_url = url_for('main.admin_board', user_id=str(user.id))
        return jsonify({
            "success": True,
            "message": "Вы успешно вошли в аккаунт.",
            "next": next_url
        }), 200
    else:
        return jsonify({
            "success": False,
            "message": "Неверные данные для входа."
        }), 401

@main.route('/logout', methods=['GET'])
@login_required
def logout():
    logout_user()
    return redirect(url_for('main.index'))


@limiter.limit("10 per minute")
@main.route('/adminboard/<uuid:user_id>', methods=['GET'])
@login_required
def admin_board(user_id: str):
    if not current_user.is_authenticated:
        return jsonify({
            "success": False,
            "message": "Запрещен переход по ссылке"
        }), 401
    
    if str(current_user.id) != str(user_id):
        return jsonify({
            "success": False,
            "message": "Запрещен переход по ссылке"
        }), 403
    
    return render_template("admin.html", user_id=user_id)

@limiter.limit("10 per minute")
@main.route('/adminboard/load_all_provide_service', methods=['GET'])
@login_required
@check_access('manager')
def load_provide_services():
    allServices = [service.to_dict() for service in ProvideServices.query.all()]
    filterList = [filter_item.to_dict() for filter_item in FilterList.query.all()]
    
    return jsonify({
        "success": True,
        "all_services": allServices,
        "filter_list": filterList
    })
    
@main.route('/adminboard/add_service', methods=['POST'])
@login_required
@check_access('moder')
def add_service():
    from __init__ import create_app
    
    app = create_app()
    unique_filename = None
    
    try:
        if 'image' in request.files:
            file = request.files['image']
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                unique_filename = f"{uuid.uuid4().hex}_{filename}"
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], unique_filename))
        
        data = json.loads(request.form.get('data'))
        
        new_service = ProvideServices(
            name=data.get('name'),
            description=data.get('description', ''),
            filter_name=data.get('filter_name'),
            cost=data.get('cost'),
            duraction_work=data.get('duraction_work'),
            materials=data.get('materials'),
            include_service=data.get('include_service'),
            img_url=unique_filename if unique_filename else None  
        )
        
        print(unique_filename)
        
        db.session.add(new_service)
        db.session.commit()
        
        return jsonify({"success": True, "message": "Услуга успешно добавлена"}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500

@main.route('/adminboard/update_service', methods=['POST'])
@login_required
@check_access('moder')
def update_service():
    from __init__ import create_app
    
    app = create_app()
    unique_filename = None
    
    try:
        if 'image' in request.files:
            file = request.files['image']
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                unique_filename = f"{uuid.uuid4().hex}_{filename}"
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], unique_filename))
        
        data = json.loads(request.form.get('data'))
        service_id = data.get('id')
        
        service = ProvideServices.query.get(service_id)
        if not service:
            return jsonify({
                "success": False,
                "message": "Услуга не найдена"
            }), 404
            
        service.name = data.get('name', service.name)
        service.description = data.get('description', service.description)
        service.filter_name = data.get('filter_name', service.filter_name)
        service.cost = data.get('cost', service.cost)
        service.duraction_work = data.get('duraction_work', service.duraction_work)
        service.materials = data.get('materials', service.materials)
        service.include_service = data.get('include_service', service.include_service)

        if unique_filename:
            if service.img_url:
                try:
                    old_file_path = os.path.join(app.config['UPLOAD_FOLDER'], service.img_url)
                    if os.path.exists(old_file_path):
                        os.remove(old_file_path)
                except Exception as e:
                    print(f"Ошибка при удалении старого изображения: {str(e)}")
            
            service.img_url = unique_filename
        
        else: 
            service.img_url = None
        
        db.session.commit()
        
        print(service.img_url)
        
        return jsonify({
            "success": True,
            "message": "Услуга успешно обновлена"
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

@main.route('/adminboard/delete_service/<int:service_id>', methods=['DELETE'])
@login_required
@check_access('tech')
def delete_service(service_id):
    try:
        service = ProvideServices.query.get(service_id)
        if not service:
            return jsonify({
                "success": False,
                "message": "Услуга не найдена"
            }), 404
            
        db.session.delete(service)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Услуга успешно удалена"
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

@main.route('/adminboard/get_service/<int:service_id>', methods=['GET'])
@login_required
@check_access('manager')
def get_service(service_id):
    service = ProvideServices.query.get(service_id)
    if not service:
        return jsonify({
            "success": False,
            "message": "Услуга не найдена"
        }), 404
        
    return jsonify({
        "success": True,
        "service": service.to_dict()
    }), 200

@main.route('/adminboard/add_filter', methods=['PUT'])
@login_required
@check_access('moder')
def add_filter():
    data = request.get_json()
    name = data.get('name')
    
    if not name:
        return jsonify({
            "success": False,
            "message": "Название фильтра обязательно"
        }), 400
    
    try:
        new_filter = FilterList(name=name)
        db.session.add(new_filter)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Фильтр успешно добавлен"
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

@main.route('/adminboard/update_filter', methods=['POST'])
@login_required
@check_access('moder')
def update_filter():
    data = request.get_json()
    filter_id = data.get('id')
    name = data.get('name')
    
    if not name:
        return jsonify({
            "success": False,
            "message": "Название фильтра обязательно"
        }), 400
    
    try:
        filter_item = FilterList.query.get(filter_id)
        if not filter_item:
            return jsonify({
                "success": False,
                "message": "Фильтр не найден"
            }), 404
            
        filter_item.name = name
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Фильтр успешно обновлен"
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

@main.route('/adminboard/delete_filter/<int:filter_id>', methods=['DELETE'])
@login_required
@check_access('tech')
def delete_filter(filter_id):
    try:
        other_filter = FilterList.query.filter_by(name="Другие").first()
        if not other_filter:
            other_filter = FilterList(name="Другие")
            db.session.add(other_filter)
            db.session.commit()
        
        ProvideServices.query.filter_by(filter_name=filter_id).update({
            'filter_name': other_filter.id
        })
        
        filter_item = FilterList.query.get(filter_id)
        if not filter_item:
            return jsonify({
                "success": False,
                "message": "Фильтр не найден"
            }), 404
            
        if filter_item.id == other_filter.id:
            return jsonify({
                "success": False,
                "message": "Вы не можете удалить фильтр 'Другие'"
            }), 403
            
        db.session.delete(filter_item)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Фильтр успешно удален, услуги перемещены в 'Другие'"
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

@main.route('/adminboard/get_filter/<int:filter_id>', methods=['GET'])
@login_required
@check_access('manager')
def get_filter(filter_id):
    filter_item = FilterList.query.get(filter_id)
    if not filter_item:
        return jsonify({
            "success": False,
            "message": "Фильтр не найден"
        }), 404
        
    return jsonify({
        "success": True,
        "filter": {
            "id": filter_item.id,
            "name": filter_item.name
        }
    }), 20

@main.route('/adminboard/get_request/<string:request_id>', methods=['GET'])
@login_required
@check_access('manager')
def get_request(request_id):
    try:
        request_item = Requests.query.get(UUID(request_id))
        if not request_item:
            return jsonify({
                "success": False,
                "message": "Заявка не найдена"
            }), 404
        
        request_item.status = "В рассмотрении"
        db.session.commit()
        
        return jsonify({
            "success": True,
            "request": request_item.to_dict()
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500
        
@main.route('/adminboard/get_requests', methods=['GET'])
@login_required
@check_access('manager')
def get_requests():
    requests = [request.to_dict() for request in Requests.query.order_by(Requests.created_at.desc()).all()]
    
    return jsonify({
        "success": True,
        "requests": requests
    })
    
@main.route('/adminboard/update_request_status/<string:request_id>', methods=['POST'])
@login_required
@check_access('manager')
def update_request_status(request_id):
    try:
        request_item = Requests.query.get(UUID(request_id))
        if not request_item:
            return jsonify({"success": False, "message": "Заявка не найдена"}), 404
        
        data = request.get_json()
        new_status = data.get('status')
        
        if new_status not in ['Новая', 'В рассмотрении', 'В работе', 'Завершена', 'Отклонена']:
            return jsonify({"success": False, "message": "Недопустимый статус"}), 400
        
        request_item.status = new_status
        db.session.commit()
        
        return jsonify({"success": True, "message": "Статус заявки обновлен"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500

@main.route('/submit_order', methods=['POST'])
def submit_order():
    data = request.get_json()
    phone = data['phone']
    email = data.get('email')
    
    blocked = False
    if email:
        blocked = BlockedContact.query.filter(
            (BlockedContact.phone == phone) | 
            (BlockedContact.email == email)
        ).first()
    else:
        blocked = BlockedContact.query.filter_by(phone=phone).first()
    
    if blocked:
        return jsonify({
            "success": False,
            "message": "Ваши контактные данные заблокированы для подачи заявок"
        }), 403
    
    try:
        # Сохраняем заказ в базу
        new_request = Requests(
            full_name=data['fullName'],
            phone=data['phone'],
            email=data.get('email'),
            services=data['services'],
            comments=data['comments'],
            status='Новая',
            consent_personal_data=data['consentPersonal'],
            consent_marketing=data['consentMarketing'],
            answers=data.get('answers', [])
        )
        
        db.session.add(new_request)
        db.session.commit()
        
        # Отправляем письмо клиенту
        if data.get('email'):
            msg = Message(
    subject="Ваша заявка принята",
    recipients=[data['email']],
    html=f"""<!DOCTYPE html>
        <html>
        <head>
            <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Ваша заявка принята</title>
            <style>
                body {{
                    font-family: 'Arial', sans-serif;
                    line-height: 1.6;
                    color: #333333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .header {{
                    background-color: #2c3e50;
                    padding: 20px;
                    text-align: center;
                    color: white;
                    border-radius: 5px 5px 0 0;
                }}
                .content {{
                    padding: 20px;
                    background-color: #f9f9f9;
                    border-left: 1px solid #e0e0e0;
                    border-right: 1px solid #e0e0e0;
                }}
                .footer {{
                    padding: 15px;
                    text-align: center;
                    font-size: 12px;
                    color: #777777;
                    background-color: #ecf0f1;
                    border-radius: 0 0 5px 5px;
                    border-left: 1px solid #e0e0e0;
                    border-right: 1px solid #e0e0e0;
                    border-bottom: 1px solid #e0e0e0;
                }}
                h1 {{
                    color: #2c3e50;
                    margin-top: 0;
                }}
                .services-list {{
                    background-color: white;
                    padding: 15px;
                    border-radius: 5px;
                    margin: 15px 0;
                    border: 1px solid #e0e0e0;
                }}
                .request-id {{
                    font-weight: bold;
                    color: #e74c3c;
                }}
                .signature {{
                    margin-top: 30px;
                    font-style: italic;
                }}
                .highlight {{
                    background-color: #fffde7;
                    padding: 10px;
                    border-left: 3px solid #ffd600;
                    margin: 10px 0;
                }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Строительная компания "СтройГарант"</h1>
            </div>
            
            <div class="content">
                <h2>Уважаемый(ая), {data['fullName']}!</h2>
                
                <p>Благодарим вас за обращение в нашу компанию. Ваша заявка <span class="request-id">№{new_request.id}</span> успешно принята в обработку.</p>
                
                <div class="highlight">
                    <p>Мы свяжемся с вами в ближайшее время по телефону: <strong>{data['phone']}</strong></p>
                </div>
                
                <h3>Детали вашей заявки:</h3>
                
                <div class="services-list">
                    <h4>Выбранные услуги:</h4>
                    <ul>
                        {''.join([f"<li>{item['name']} <strong>({item['price']} руб.)</strong></li>" for item in data['services']])}
                    </ul>
                </div>
                
                {f'<div class="highlight"><h4>Ваши комментарии:</h4><p>{data["comments"]}</p></div>' if data.get('comments') else ''}
                
                <p class="signature">
                    С уважением,<br>
                    строительная организация<br>
                    <small>Телефон: +7 (918) 644-24-33<br>
                    <small>Телефон: +7 (918) 995-59-59<br>
                    Email: kr-stroy-home@mail.ru</small>
                </p>
            </div>
            
            <div class="footer">
                <p>© {datetime.now().year} Строительная организация. Все права защищены.</p>
                <p>Это письмо отправлено автоматически, пожалуйста, не отвечайте на него.</p>
            </div>
        </body>
        </html>"""
        )
            mail.send(msg)
        
        return jsonify({"success": True, "message": "Заявка успешно создана"})
    except Exception as e:
        db.session.rollback()
        print(str(e))
        return jsonify({"success": False, "message": str(e)}), 500

@main.route('/adminboard/dashboard_stats', methods=['GET'])
@login_required
@check_access('manager')
def dashboard_stats():
    try:
        # Статистика посещений
        total_visitors = VisitorTracking.query.count()
        week_ago = datetime.now() - timedelta(days=7)
        prev_week_visitors = VisitorTracking.query.filter(
            VisitorTracking.visit_date < week_ago,
            VisitorTracking.visit_date >= week_ago - timedelta(days=7)
        ).count()
        visitors_change = calculate_percentage_change(prev_week_visitors, total_visitors)
        
        # Статистика заявок
        total_requests = Requests.query.count()
        prev_week_requests = Requests.query.filter(
            Requests.created_at < week_ago,
            Requests.created_at >= week_ago - timedelta(days=7)
        ).count()
        requests_change = calculate_percentage_change(prev_week_requests, total_requests)
        
        completed_requests = Requests.query.filter_by(status='Завершена').count()
        in_progress_requests = Requests.query.filter_by(status='В рассмотрении').count()
        rejected_requests = Requests.query.filter_by(status='Отклонена').count()
        
        completed_percent = round((completed_requests / total_requests) * 100, 1) if total_requests > 0 else 0
        in_progress_percent = round((in_progress_requests / total_requests) * 100, 1) if total_requests > 0 else 0
        rejected_percent = round((rejected_requests / total_requests) * 100, 1) if total_requests > 0 else 0
        
        # Заявки по дням за последние 30 дней
        requests_by_day = defaultdict(int)
        day_labels = []
        day_data = []
        
        for i in range(30):
            day = datetime.now() - timedelta(days=30 - i)
            day_str = day.strftime('%d.%m')
            day_labels.append(day_str)
            requests_by_day[day_str] = 0
        
        requests_last_30_days = Requests.query.filter(
            Requests.created_at >= datetime.now() - timedelta(days=30)
        ).all()
        
        for request in requests_last_30_days:
            day_str = request.created_at.strftime('%d.%m')
            requests_by_day[day_str] += 1
        
        for day in day_labels:
            day_data.append(requests_by_day[day])
        
        # Статусы заявок
        status_counts = defaultdict(int)
        status_labels = ['Новая', 'В рассмотрении', 'В работе', 'Завершена', 'Отклонена']
        status_data = []
        
        for status in status_labels:
            count = Requests.query.filter_by(status=status).count()
            status_counts[status] = count
        
        for status in status_labels:
            status_data.append(status_counts[status])
        
        # Последние 10 заявок
        recent_requests = Requests.query.order_by(Requests.created_at.desc()).limit(10).all()
        
        return jsonify({
            "success": True,
            "stats": {
                "visitors": total_visitors,
                "visitorsChange": visitors_change,
                "totalRequests": total_requests,
                "requestsChange": requests_change,
                "completedRequests": completed_requests,
                "completedPercent": completed_percent,
                "inProgressRequests": in_progress_requests,
                "inProgressPercent": in_progress_percent,
                "rejectedRequests": rejected_requests,
                "rejectedPercent": rejected_percent,
            },
            "chartData": {
                "requestsByDay": {
                    "labels": day_labels,
                    "data": day_data
                },
                "requestsByStatus": {
                    "labels": status_labels,
                    "data": status_data
                }
            },
            "recentRequests": [request.to_dict() for request in recent_requests]
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

def calculate_percentage_change(old_value, new_value):
    if old_value == 0:
        return 0
    return round(((new_value - old_value) / old_value) * 100, 1)


""" Обратка запросов для вопросов категорий """
@main.route('/adminboard/get_questions', methods=['GET'])
def get_questions():
    questions = ServiceQuestion.query.join(FilterList).all()
    result = []
    
    for question in questions:
        result.append({
            'id': question.id,
            'question_text': question.question_text,
            'filter_name': question.filter.name,
            'filter_id': question.filter_id,
            'is_required': question.is_required,
            'answer_type': question.answer_type
        })
    
    return jsonify({
        "success": True,
        "questions": result
    })

@main.route('/adminboard/add_questions', methods=['PUT'])
@login_required
@check_access('moder')
def add_questions():
    data = request.get_json()
    filter_id = data.get('filter_id')
    questions = data.get('questions', [])
    
    if not filter_id or not questions:
        return jsonify({"success": False, "message": "Не все обязательные поля заполнены"}), 400
    
    try:
        for question_data in questions:
            new_question = ServiceQuestion(
                filter_id=filter_id,
                question_text=question_data['question_text'],
                is_required=question_data.get('is_required', False),
                answer_type=question_data.get('answer_type', 'text')
            )
            db.session.add(new_question)
        
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Вопросы успешно добавлены"
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

@main.route('/adminboard/update_question', methods=['POST'])
@login_required
@check_access('moder')
def update_question():
    data = request.get_json()
    question_id = data.get('id')
    
    try:
        question = ServiceQuestion.query.get(question_id)
        if not question:
            return jsonify({
                "success": False,
                "message": "Вопрос не найден"
            }), 404
            
        question.filter_id = data.get('filter_id', question.filter_id)
        question.question_text = data.get('question_text', question.question_text)
        question.is_required = data.get('is_required', question.is_required)
        question.answer_type = data.get('answer_type', question.answer_type)
        
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Вопрос успешно обновлен"
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

@main.route('/adminboard/delete_question/<int:question_id>', methods=['DELETE'])
@login_required
@check_access('tech')
def delete_question(question_id):
    try:
        question = ServiceQuestion.query.get(question_id)
        if not question:
            return jsonify({
                "success": False,
                "message": "Вопрос не найден"
            }), 404
            
        db.session.delete(question)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Вопрос успешно удален"
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

@main.route('/adminboard/get_question/<int:question_id>', methods=['GET'])
@login_required
@check_access('manager')
def get_question(question_id):
    question = ServiceQuestion.query.get(question_id)
    if not question:
        return jsonify({
            "success": False,
            "message": "Вопрос не найден"
        }), 404
        
    return jsonify({
        "success": True,
        "question": {
            "id": question.id,
            "filter_id": question.filter_id,
            "question_text": question.question_text,
            "is_required": question.is_required,
            "answer_type": question.answer_type
        }
    }), 200

@main.route('/adminboard/get_users', methods=['GET'])
@login_required
@check_access('manager')
def get_users():
    search = request.args.get('search', '')
    
    query = User.query
    
    if search:
        query = query.filter(
            db.or_(
                User.username.ilike(f'%{search}%'),
                User.email.ilike(f'%{search}%'),
                User.first_name.ilike(f'%{search}%'),
                User.last_name.ilike(f'%{search}%')
            )
        )
    
    roles = Role.query.all()
    
    return jsonify({
        "success": True,
        "users": [user.to_dict() for user in User.query.all()],
        "roles": [{
            "id": role.id,
            "name": role.name,
            "is_admin": role.is_admin
        } for role in roles]
    })

@main.route('/adminboard/get_user/<string:user_id>', methods=['GET'])
@login_required
@check_access('manager')
def get_user(user_id):
    if not current_user.is_admin():
        return jsonify({"success": False, "message": "Недостаточно прав"}), 403
    
    user = User.query.get(UUID(user_id))
    if not user:
        return jsonify({"success": False, "message": "Пользователь не найден"}), 404
    
    return jsonify({
        'success': True,
        'user': user.to_dict(),
    })

@main.route('/adminboard/add_user', methods=['PUT'])
@login_required
@check_access('admin')
def add_user():
    if not current_user.is_admin():
        return jsonify({"success": False, "message": "Недостаточно прав"}), 403
    data = request.get_json()
    
    if User.query.filter_by(email=data['email']).first():
        return jsonify({
            "success": False,
            "message": "Пользователь с таким email уже существует"
        }), 400
    
    required_fields = ['username', 'email', 'password', 'role_id']
    if not all(field in data for field in required_fields):
        return jsonify({"success": False, "message": "Не все обязательные поля заполнены"}), 400
    
    try:
        new_user = User(
            username=data['username'],
            email=data['email'],
            first_name=data.get('first_name'),
            last_name=data.get('last_name'),
            role_id=data['role_id'],
        )
        new_user.set_password(data['password'])
        
        db.session.add(new_user)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Пользователь успешно добавлен"
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

@main.route('/adminboard/update_user', methods=['POST'])
@login_required
@check_access('admin')
def update_user():
    data = request.get_json()
    
    try:
        user = User.query.get(UUID(data['id']))
        if not user:
            return jsonify({"success": False, "message": "Пользователь не найден"}), 404
        
        # Проверяем права
        if not current_user.is_admin() and current_user.id != user.id:
            return jsonify({"success": False, "message": "Недостаточно прав"}), 403
        
        user.username = data.get('username', user.username)
        user.email = data.get('email', user.email)
        user.first_name = data.get('first_name', user.first_name)
        user.last_name = data.get('last_name', user.last_name)
        user.blocked = data.get('is_blocked', user.is_blocked)
        
        if current_user.is_admin() and 'role_id' in data:
            user.role_id = data['role_id']
        
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Пользователь успешно обновлен"
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

@main.route('/adminboard/delete_user/<string:user_id>', methods=['DELETE'])
@login_required
@check_access('admin')
def delete_user(user_id):
    if not current_user.is_admin():
        return jsonify({"success": False, "message": "Недостаточно прав"}), 403
    
    try:
        user = User.query.get(UUID(user_id))
        if not user:
            return jsonify({"success": False, "message": "Пользователь не найден"}), 404
        
        if user.is_admin():
            return jsonify({"success": False, "message": "Нельзя удалить администратора"}), 403
        
        db.session.delete(user)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Пользователь успешно удален"
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500
        
@main.route('/adminboard/block_user/<string:user_id>', methods=['POST'])
@login_required
@check_access('admin')
def block_user(user_id):
    try:
        user = User.query.get(UUID(user_id))
        if not user:
            return jsonify({"success": False, "message": "Пользователь не найден"}), 404
        
        if user.role.name == 'admin':
            return jsonify({"success": False, "message": "Нельзя заблокировать администратора"}), 403
        
        user.is_blocked = True
        db.session.commit()
        
        return jsonify({"success": True, "message": "Пользователь заблокирован"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500

@main.route('/adminboard/unblock_user/<string:user_id>', methods=['POST'])
@login_required
@check_access('admin')
def unblock_user(user_id):
    try:
        user = User.query.get(UUID(user_id))
        if not user:
            return jsonify({"success": False, "message": "Пользователь не найден"}), 404
        
        user.is_blocked = False
        db.session.commit()
        
        return jsonify({"success": True, "message": "Пользователь разблокирован"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500

@main.route('/adminboard/get_subscribers', methods=['GET'])
@login_required
@check_access('manager')
def get_subscribers():
    if not current_user.is_admin:
        return jsonify({"success": False, "message": "Недостаточно прав"}), 403

    search = request.args.get('search', '')
    
    query = Requests.query.filter(
        Requests.consent_marketing == True,
        Requests.email.isnot(None)
    ).distinct(Requests.email)
    
    if search:
        query = query.filter(
            db.or_(
                Requests.email.ilike(f'%{search}%'),
                Requests.full_name.ilike(f'%{search}%'),
                Requests.phone.ilike(f'%{search}%')
            )
        )
    
    subscribers = query.all()
    
    return jsonify({
        "success": True,
        "subscribers": [{
            "email": req.email,
            "full_name": req.full_name,
            "phone": req.phone,
            "last_activity": req.created_at.isoformat() if req.created_at else None
        } for req in subscribers]
    })

@main.route('/adminboard/send_newsletter', methods=['POST'])
@login_required
@check_access('manager')
def send_newsletter():
    if not current_user.is_admin:
        return jsonify({"success": False, "message": "Недостаточно прав"}), 403
    
    data = request.get_json()
    subject = data.get('subject')
    content = data.get('content')
    
    if not subject or not content:
        return jsonify({"success": False, "message": "Не все обязательные поля заполнены"}), 400
    
    try:
        subscribers = Requests.query.filter(
            Requests.consent_marketing == True,
            Requests.email.isnot(None)
        ).distinct(Requests.email).all()
        
        for subscriber in subscribers:
            msg = Message(
                subject=subject,
                recipients=[subscriber.email],
                html=f"""<!DOCTYPE html>
                    <html>
                    <head>
                        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>{subject}</title>
                        <style>
                            body {{
                                font-family: 'Arial', sans-serif;
                                line-height: 1.6;
                                color: #333333;
                                max-width: 600px;
                                margin: 0 auto;
                                padding: 20px;
                            }}
                            .header {{
                                background-color: #2c3e50;
                                padding: 25px;
                                text-align: center;
                                color: white;
                                border-radius: 5px 5px 0 0;
                            }}
                            .logo {{
                                font-size: 24px;
                                font-weight: bold;
                                margin-bottom: 10px;
                            }}
                            .content {{
                                padding: 25px;
                                background-color: #f9f9f9;
                                border-left: 1px solid #e0e0e0;
                                border-right: 1px solid #e0e0e0;
                            }}
                            .footer {{
                                padding: 20px;
                                text-align: center;
                                font-size: 12px;
                                color: #777777;
                                background-color: #ecf0f1;
                                border-radius: 0 0 5px 5px;
                                border: 1px solid #e0e0e0;
                                border-top: none;
                            }}
                            h1 {{
                                color: #2c3e50;
                                margin-top: 0;
                                font-size: 22px;
                            }}
                            .greeting {{
                                font-size: 18px;
                                margin-bottom: 20px;
                            }}
                            .message-content {{
                                background-color: white;
                                padding: 20px;
                                border-radius: 5px;
                                margin: 20px 0;
                                border: 1px solid #e0e0e0;
                                line-height: 1.7;
                            }}
                            .signature {{
                                margin-top: 30px;
                                border-top: 1px solid #e0e0e0;
                                padding-top: 15px;
                                font-style: italic;
                            }}
                            .unsubscribe {{
                                font-size: 11px;
                                color: #999;
                                margin-top: 30px;
                                text-align: center;
                            }}
                            .highlight {{
                                background-color: #f8f4e5;
                                padding: 15px;
                                border-left: 4px solid #e67e22;
                                margin: 15px 0;
                            }}
                        </style>
                    </head>
                    <body>
                        <div class="header">
                        </div>
                        
                        <div class="content">
                            <div class="greeting">Уважаемый(ая) {subscriber.full_name or 'клиент'}!</div>
                            
                            <div class="message-content">
                                {content.replace(chr(10), '<br>')}
                            </div>
                            
                            <div class="signature">
                                С уважением,<br>
                                <strong>Стоительная организация"</strong><br>
                                <small>Телефон: +7 (918) 644-24-33<br>
                                <small>Телефон: +7 (918) 995-59-59<br>
                                Email: kr-stroy-home@mail.ru<br>
                                Сайт: <a href="https://kr-stroy-home.ru/">kr-stroy-home.ru</a></small>
                            </div>
                        </div>
                        
                        <div class="footer">
                            <p>© {datetime.now().year} Строительная организация. Все права защищены.</p>
                            <p>Это письмо отправлено автоматически, пожалуйста, не отвечайте на него.</p>
                        </div>
                    </body>
                    </html>"""
            )
            mail.send(msg)
        
        return jsonify({
            "success": True,
            "message": f"Рассылка успешно отправлена {len(subscribers)} подписчикам"
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

@main.route('/update_activity', methods=['POST'])
@login_required
@check_access('manager')
def update_activity():
    try:
        current_user.last_activity = datetime.now(moscow_tz)
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@main.route('/adminboard/block_contact/<string:request_id>', methods=['POST'])
@login_required
@check_access('moder')
def block_contact(request_id):
    try:
        request_item = Requests.query.get(UUID(request_id))
        if not request_item:
            return jsonify({"success": False, "message": "Заявка не найдена"}), 404
        
        existing_block = BlockedContact.query.filter(
            (BlockedContact.phone == request_item.phone) |
            (BlockedContact.email == request_item.email)
        ).first()
        
        if existing_block:
            return jsonify({"success": False, "message": "Контакт уже заблокирован"}), 400
        
        new_block = BlockedContact(
            phone=request_item.phone,
            email=request_item.email,
            request_id=request_item.id,
            reason="Блокировка администратором"
        )
        
        db.session.add(new_block)
        db.session.commit()
        
        return jsonify({"success": True})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500
    
@main.route('/adminboard/get_blocked_contacts', methods=['GET'])
@login_required
@check_access('manager')
def get_blocked_contacts():
    search = request.args.get('search', '')
    
    query = BlockedContact.query.order_by(BlockedContact.blocked_at.desc())
    
    if search:
        query = query.filter(
            db.or_(
                BlockedContact.phone.ilike(f'%{search}%'),
                BlockedContact.email.ilike(f'%{search}%')
            )
        )
    
    blocked = query.all()
    return jsonify({
        "success": True,
        "blocked_contacts": [{
            "id": b.id,
            "phone": b.phone,
            "email": b.email,
            "blocked_at": b.blocked_at.isoformat(),
            "reason": b.reason
        } for b in blocked]
    })
    
@main.route('/adminboard/unblock_contact/<int:contact_id>', methods=['DELETE'])
@login_required
@check_access('tech')
def unblock_contact(contact_id):
    try:
        contact = BlockedContact.query.get(contact_id)
        if not contact:
            return jsonify({"success": False, "message": "Контакт не найден"}), 404
            
        db.session.delete(contact)
        db.session.commit()
        
        return jsonify({"success": True, "message": "Контакт успешно разблокирован"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500
    

@main.route('/adminboard/delete_request/<string:request_id>', methods=['DELETE'])
@login_required
@check_access('tech')
def delete_request(request_id):
    try:
        request_item = Requests.query.get(UUID(request_id))
        if not request_item:
            return jsonify({"success": False, "message": "Заявка не найдена"}), 404
        
        if request_item.status not in ['Завершена', 'Отклонена']:
            return jsonify({
                "success": False, 
                "message": "Можно удалять только завершенные или отклоненные заявки"
            }), 400
            
        db.session.delete(request_item)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Заявка успешно удалена"
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500