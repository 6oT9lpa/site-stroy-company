document.addEventListener('DOMContentLoaded', function() {
    // Плавный скролл для навигации
    document.querySelectorAll('nav a').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId && targetId !== '#') {
                document.querySelector(targetId).scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });

    loadServicesAndFilters();
    loadServicesForCalculation();
    
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
            this.value = this.value.replace(/[^\d\+]/g, '');
        });
    }
});

function loadServicesAndFilters() {
    fetch('/get_services_for_main_page')
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            renderServiceTabs(data.filters);
            renderServices(data.services_by_filter);
            if (data.filters.length > 0) {
                switchTab(data.filters[0].toLowerCase().replace(' ', '-') + '-tab');
            }
        } else {
            console.error('Ошибка загрузки услуг:', data.message);
        }
    })
    .catch(error => {
        console.error('Ошибка при загрузке услуг:', error);
    });
}

function renderServiceTabs(filters) {
    const tabsContainer = document.getElementById('service-tabs');
    tabsContainer.innerHTML = '';
    
    const icons = {
        'Дом под ключ': 'fa-home'
    };

    const fallbackIcons = [
        'fa-hammer',
        'fa-tools',
        'fa-cogs',
        'fa-wrench',
        'fa-screwdriver',
        'fa-building',
        'fa-toolbox',
        'fa-chevron-up',
        'fa-chevron-down',
        'fa-border-style',
    ];
    
    filters.forEach(filter => {
        const tabButton = document.createElement('button');
        tabButton.className = 'tab-button';
        tabButton.dataset.tab = filter.toLowerCase().replace(' ', '-');
        
        const iconClass = icons[filter] || fallbackIcons[Math.floor(Math.random() * fallbackIcons.length)];
        tabButton.innerHTML = `
            <i class="fas ${iconClass}"></i> ${filter}
        `;
        
        tabsContainer.appendChild(tabButton);
    });
    
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab') + '-tab';
            switchTab(tabId);
        });
    });
}

function renderServices(servicesByFilter) {
    const stagesContainer = document.getElementById('construction-stages');
    stagesContainer.innerHTML = '';
    
    for (const [filterName, services] of Object.entries(servicesByFilter)) {
        const stageCard = document.createElement('div');
        stageCard.className = 'stage-card';
        stageCard.id = filterName.toLowerCase().replace(' ', '-') + '-tab';
        
        const stageHeader = document.createElement('div');
        stageHeader.className = 'stage-header';
        
        stageHeader.innerHTML = `
            <i class="fas fa-hammer"></i>
            <h3>${filterName}</h3>
        `;
        
        const serviceList = document.createElement('div');
        serviceList.className = 'service-list';
        
        services.forEach(service => {
            let materialsHtml = '';
            if (service.materials && service.materials.length > 0) {
                materialsHtml = `
                    <div class="materials">
                        <h5>Доступные материалы:</h5>
                        <div class="materials-grid">
                            ${service.materials.map(m => `
                                <span class="material ${m.active ? 'available' : 'unavailable'}">
                                    <i class="fas ${m.active ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                                    <span>${m.name}</span>
                                </span>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
            
            let includedHtml = '';
            if (service.include_service && service.include_service.length > 0) {
                includedHtml = `
                    <div class="materials">
                        <h5>Включено в услугу:</h5>
                        <div class="materials-grid">
                            ${service.include_service.map(s => `
                                <span class="material available">
                                    <i class="fas fa-check-circle"></i>
                                    <span>${s}</span>
                                </span>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
            
            const serviceItem = document.createElement('div');
            serviceItem.className = 'service-item';
            serviceItem.innerHTML = `
                <div class="service-description-popup">
                    ${service.description || 'Описание отсутствует'}
                </div>
                <div class="service-info">
                    <h4>${service.name}</h4>
                    <p class="price">От ${service.cost}</p>
                    <p class="duration"><i class="fas fa-clock"></i> Срок: ${service.duraction_work || 'уточняйте'}</p>
                </div>
                ${materialsHtml}
                ${includedHtml}
                <button class="order-btn">Заказать услугу</button>
            `;
            
            serviceList.appendChild(serviceItem);
        });
        
        stageCard.appendChild(stageHeader);
        stageCard.appendChild(serviceList);
        stagesContainer.appendChild(stageCard);
    }
    

    document.querySelectorAll('.order-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const serviceItem = this.closest('.service-item');
        const serviceName = serviceItem.querySelector('h4')?.textContent;
        const servicePrice = serviceItem.querySelector('.price')?.textContent;
        
        addToCart({
            name: serviceName,
            price: servicePrice
        });
    });
});
}

function switchTab(tabId) {
    document.querySelectorAll('.stage-card').forEach(card => card.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-button[data-tab="${tabId.replace('-tab', '')}"]`).classList.add('active');
}

function loadServicesForCalculation() {
    fetch('/get_services_for_main_page')
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            renderServicesCheckbox(data.services_by_filter);
        }
    });
}

let cart = [];
let currentFilterQuestions = {};

function loadServicesAndFilters() {
    fetch('/get_services_for_main_page')
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            renderServiceTabs(data.filters);
            renderServices(data.services_by_filter);
            if (data.filters.length > 0) {
                switchTab(data.filters[0].toLowerCase().replace(' ', '-') + '-tab');
            }
            loadQuestionsForFilters(data.filters);
        } else {
            console.error('Ошибка загрузки услуг:', data.message);
        }
    })
    .catch(error => {
        console.error('Ошибка при загрузке услуг:', error);
    });
}

function addToCart(service) {
    const existingItem = cart.find(item => item.name === service.name);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            ...service,
            quantity: 1,
            filter: service.filter 
        });
    }
    
    updateCartUI();
    
    // Собираем уникальные фильтры из корзины
    const uniqueFilters = [...new Set(cart.map(item => item.filter))];
    showQuestionsForFilters(uniqueFilters);
}

function showQuestionsForFilters(filters) {
    // Получаем все вопросы для указанных фильтров
    fetch('/adminboard/get_questions')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const questionsByFilter = {};
                
                // Группируем вопросы по фильтрам
                data.questions.forEach(q => {
                    if (filters.includes(q.filter_name)) {
                        if (!questionsByFilter[q.filter_name]) {
                            questionsByFilter[q.filter_name] = [];
                        }
                        questionsByFilter[q.filter_name].push(q);
                    }
                });
                
                // Показываем модальное окно с вопросами
                if (Object.keys(questionsByFilter).length > 0) {
                    showQuestionsModal(questionsByFilter);
                }
            }
        });
}

function showQuestionsModal(questionsByFilter) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'questions-modal';
    
    // Создаем HTML для всех вопросов, сгруппированных по фильтрам
    let questionsHtml = '';
    
    for (const [filterName, questions] of Object.entries(questionsByFilter)) {
        questionsHtml += `
            <div class="filter-questions-group">
                <h4>${filterName}</h4>
                ${questions.map((q, i) => `
                    <div class="form-group">
                        <label for="question-${q.id}">${q.question_text}${q.is_required ? '*' : ''}</label>
                        ${q.answer_type === 'text' ? 
                            `<textarea id="question-${q.id}" ${q.is_required ? 'required' : ''}></textarea>` : 
                            `<input type="${q.answer_type}" id="question-${q.id}" ${q.is_required ? 'required' : ''}>`
                        }
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Дополнительные вопросы</h3>
                <span class="close-modal">&times;</span>
            </div>
            <div class="modal-body" id="questions-modal-body">
                ${questionsHtml}
            </div>
            <div class="modal-footer">
                <button class="save-btn">Продолжить</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-modal').addEventListener('click', () => {
        modal.remove();
    });
    
    modal.querySelector('.save-btn').addEventListener('click', () => {
        const answers = [];
        let isValid = true;
        
        // Собираем ответы на все вопросы
        for (const [filterName, questions] of Object.entries(questionsByFilter)) {
            questions.forEach(q => {
                const answerElement = document.getElementById(`question-${q.id}`);
                const answer = answerElement.value;
                
                if (q.is_required && !answer) {
                    isValid = false;
                    answerElement.classList.add('error');
                } else {
                    answerElement.classList.remove('error');
                    answers.push({
                        question: q.question_text,
                        answer: answer,
                        filter_id: q.filter_id
                    });
                }
            });
        }
        
        if (!isValid) {
            alert('Пожалуйста, заполните все обязательные вопросы');
            return;
        }
        
        // Сохраняем ответы в последний добавленный товар
        if (cart.length > 0) {
            cart[cart.length - 1].answers = answers;
        }
        
        modal.remove();
    });
    
    modal.style.display = 'flex';
}

function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartUI();
}

function updateCartUI() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartCount = document.getElementById('cart-count');
    const proceedBtn = document.getElementById('proceed-to-order');
    const orderSidebar = document.querySelector('.order-sidebar');
    
    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<p class="empty-cart-message">Корзина пуста</p>';
        cartCount.textContent = '0';
        proceedBtn.style.display = 'none';
        orderSidebar.style.display = 'none';
        return;
    }
    
    cartItemsContainer.innerHTML = '';
    
    cart.forEach((item, index) => {
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        cartItem.innerHTML = `
            <h4>${item.name}</h4>
            <p>${item.price} × ${item.quantity}</p>
            <button class="cart-item-remove" data-index="${index}">
                <i class="fas fa-times"></i>
            </button>
        `;
        cartItemsContainer.appendChild(cartItem);
    });
    
    document.querySelectorAll('.cart-item-remove').forEach(btn => {
        btn.addEventListener('click', function() {
            removeFromCart(parseInt(this.dataset.index));
        });
    });
    
    cartCount.textContent = cart.length;
    proceedBtn.style.display = 'block';
    orderSidebar.style.display = 'block';
    
    proceedBtn.onclick = function() {
        document.querySelector('#order').scrollIntoView({ behavior: 'smooth' });
    };
}

document.getElementById('order-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const formData = {
        fullName: document.getElementById('full-name').value,
        phone: document.getElementById('phone').value,
        email: document.getElementById('email').value,
        comments: document.getElementById('comments').value,
        services: cart,
        consentPersonal: document.getElementById('consent-personal').checked,
        consentMarketing: document.getElementById('consent-marketing').checked
    };
    
    if (!validateOrderForm(formData)) return;
    
    fetch('/submit_order', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showSuccessModal();
            cart = [];
            updateCartUI();
            this.reset();
        } else {
            alert('Ошибка при отправке заявки: ' + data.message);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Произошла ошибка при отправке заявки');
    });
});

function validateOrderForm(formData) {
    if (!formData.fullName || !formData.phone) {
        alert('Пожалуйста, заполните обязательные поля (ФИО и Телефон)');
        return false;
    }
    
    if (formData.comments.length < 20) {
        alert('Пожалуйста, подробнее опишите что у вас уже есть (например: фундамент, стены и т.д.)');
        return false;
    }
    
    return true;
}

function showSuccessModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Заявка отправлена!</h3>
            </div>
            <div class="modal-body">
                <i class="fas fa-check-circle success-icon"></i>
                <p>Мы свяжемся с вами в ближайшее время для уточнения деталей.</p>
            </div>
            <div class="modal-footer">
                <button class="close-btn">Закрыть</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'flex';
    
    modal.querySelector('.close-btn').addEventListener('click', () => {
        modal.remove();
    });
}