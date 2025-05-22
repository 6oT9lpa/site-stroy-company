from flask import render_template, redirect, url_for, request, Blueprint, session, jsonify, send_from_directory
from sqlalchemy.exc import SQLAlchemyError
from flask_login import login_user, login_required, logout_user, current_user
from limiter import limiter
import traceback, json, os
from uuid import UUID
from datetime import datetime, timedelta
from collections import defaultdict

main = Blueprint('main', __name__)

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

# Middleware для отслеживания посещений
@main.before_request
def track_visitor():
    excluded_paths = ['static', 'adminboard', 'favicon.ico']
    
    if any(path in request.path for path in excluded_paths):
        return
    
    try:
        from __init__ import VisitorTracking, db
        
        ip_address = request.headers.get('X-Forwarded-For', request.remote_addr)
        if ',' in ip_address:
            ip_address = ip_address.split(',')[0].strip()
        
        visitor = VisitorTracking(
            ip_address=ip_address,
            user_agent=request.user_agent.string,
            page_visited=request.path,
            referrer=request.referrer
        )
        
        db.session.add(visitor)
        db.session.commit()
    except Exception as e:
        print(f"Error tracking visitor: {str(e)}")

@limiter.limit("10 per minute")
@main.route('/', methods=['GET'])
def index():
    nonce = os.urandom(16).hex()
    return render_template('index.html', nonce=nonce)

@main.route('/get_services_for_main_page', methods=['GET'])
def get_services_for_main_page():
    from __init__ import ProvideServices, FilterList
    
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
    
    from __init__ import User
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
    next_url = url_for('main.index')
    return jsonify({
        "success": True,
        "message": "Вы вышли из аккаунта.",
        "next": next_url
    }), 200


@limiter.limit("10 per minute")
@main.route('/adminboard/<uuid:user_id>', methods=['GET'])
@login_required
def admin_board(user_id: UUID):
    if not current_user.is_authenticated:
        return jsonify({
            "success": False,
            "message": "Запрещен переход по ссылке"
        }), 401
    
    if current_user.id != user_id:
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
    from __init__ import ProvideServices, FilterList
    
    allServices = [service.to_dict() for service in ProvideServices.query.all()]
    filterList = [filter_item.to_dict() for filter_item in FilterList.query.all()]
    
    return jsonify({
        "success": True,
        "all_services": allServices,
        "filter_list": filterList
    })
    
@main.route('/adminboard/add_service', methods=['PUT'])
@login_required
@check_access('moder')
def add_service():
    from __init__ import ProvideServices, db
    
    data = request.get_json()
    
    try:
        new_service = ProvideServices(
            name=data.get('name'),
            description=data.get('description', ''),
            filter_name=data.get('filter_name'),
            cost=data.get('cost'),
            duraction_work=data.get('duraction_work'),
            materials=data.get('materials'),
            include_service=data.get('include_service')
        )
        
        db.session.add(new_service)
        db.session.commit()
        
        return jsonify({
            "success": True,
            "message": "Услуга успешно добавлена"
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

@main.route('/adminboard/update_service', methods=['POST'])
@login_required
@check_access('moder')
def update_service():
    from __init__ import ProvideServices, db
    
    data = request.get_json()
    service_id = data.get('id')
    
    try:
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
        
        db.session.commit()
        
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
    from __init__ import ProvideServices, db
    
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
    from __init__ import ProvideServices
    
    service = ProvideServices.query.get(service_id)
    if not service:
        return jsonify({
            "success": False,
            "message": "Услуга не найдена"
        }), 404
        
    return jsonify({
        "success": True,
        "service": {
            "id": service.id,
            "name": service.name,
            "description": service.description,
            "filter_name": service.filter_name,
            "cost": service.cost,
            "duraction_work": service.duraction_work,
            "materials": service.materials,
            "include_service": service.include_service
        }
    }), 200

@main.route('/adminboard/add_filter', methods=['PUT'])
@login_required
@check_access('moder')
def add_filter():
    from __init__ import FilterList, db
    
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
    from __init__ import FilterList, db
    
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
    from __init__ import FilterList, ProvideServices, db
    
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
    from __init__ import FilterList
    
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
    from __init__ import Requests, db
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
    from __init__ import Requests
    
    requests = [request.to_dict() for request in Requests.query.all()]
    
    return jsonify({
        "success": True,
        "requests": requests
    })
    
@main.route('/adminboard/update_request_status/<string:request_id>', methods=['POST'])
@login_required
@check_access('manager')
def update_request_status(request_id):
    from __init__ import Requests, db
    
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
    from __init__ import Requests, db, mail, BlockedContact
    from flask_mail import Message
    
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
                body=f"""Здравствуйте, {data['fullName']}!
                Ваша заявка №{new_request.id} принята в обработку.
                Мы свяжемся с вами в ближайшее время по телефону {data['phone']}.

                Выбранные услуги:
                {chr(10).join([f"- {item['name']} ({item['price']})" for item in data['services']])}

                Комментарии:
                {data['comments']}

                С уважением,
                Строительная компания "СтройГарант"
                """
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
    from __init__ import Requests, db, VisitorTracking
    
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
    from __init__ import ServiceQuestion, FilterList
    
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
    from __init__ import ServiceQuestion, db
    
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
    from __init__ import ServiceQuestion, db
    
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
    from __init__ import ServiceQuestion, db
    
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
    from __init__ import ServiceQuestion, FilterList
    
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
    from __init__ import User, Role, db
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
    from __init__ import User, Role

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
    
    from __init__ import User, db
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
    from __init__ import User, db
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
    
    from __init__ import User, db
    
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
    from __init__ import User, db
    
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
    from __init__ import User, db
    
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
    from __init__ import db
    if not current_user.is_admin:
        return jsonify({"success": False, "message": "Недостаточно прав"}), 403
    
    from __init__ import Requests
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
    
    from __init__ import Requests, mail
    from flask_mail import Message
    
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
                body=f"Уважаемый {subscriber.full_name or 'клиент'}!\n\n{content}\n\nС уважением,\nСтроительная компания 'СтройГарант'"
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
    from __init__ import moscow_tz, db
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
    from __init__ import Requests, BlockedContact, db
    
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
    from __init__ import BlockedContact, db
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
    from __init__ import BlockedContact, db
    
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
    
