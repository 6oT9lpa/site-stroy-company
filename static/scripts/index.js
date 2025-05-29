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
    
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
            this.value = this.value.replace(/[^\d\+]/g, '');
        });
    }
    updateCartUI();
});

function truncateDescription(text, maxLength = 80) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function loadServicesAndFilters() {
    fetch('/get_services_for_main_page')
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            renderServiceTabs(data.filters);
            renderServices(data.services_by_filter);
            if (data.filters.length > 0) {
                switchTab(data.filters[0].toLowerCase());
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
        tabButton.dataset.tab = filter.toLowerCase();
        
        const iconClass = icons[filter] || fallbackIcons[Math.floor(Math.random() * fallbackIcons.length)];
        tabButton.innerHTML = `
            <i class="fas ${iconClass}"></i> ${filter}
        `;
        
        tabsContainer.appendChild(tabButton);
    });
    
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
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
        stageCard.id = filterName.toLowerCase();
        
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

            console.log

            const imageUrl = service.img_url !== null
            ? `${service.img_url}`
            : `./static/img/i.png`;
            
            const serviceItem = document.createElement('div');
            serviceItem.className = 'service-item';
            serviceItem.innerHTML = `
                <div class="service-image-container">
                    <img src="${imageUrl}" class="service-image">
                </div>
                <div class="service-info">
                    <h4>${service.name}</h4>
                    <p class="price">От ${service.cost}</p>
                    <p class="duration"><i class="fas fa-clock"></i> Срок: ${service.duraction_work || 'уточняйте'}</p>
                </div>
                <div class="service-description-container">
                    <div class="service-description-short">
                        ${service.description ? truncateDescription(service.description) : 'Описание отсутствует'}
                    </div>
                    <div class="service-description-full" style="display: none;">
                        ${service.description || 'Описание отсутствует'}
                    </div>
                    ${service.description && service.description.length > 100 ? 
                        '<button class="toggle-description-btn">Подробнее</button>' : ''}
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
    
    if (window.innerWidth > 768) {
        document.querySelectorAll('.service-item').forEach(item => {
            item.addEventListener('mouseenter', () => {
                const popup = item.querySelector('.service-description-popup');
                if (popup) {
                    popup.style.display = 'block';
                    const rect = popup.getBoundingClientRect();
                    if (rect.right > window.innerWidth) {
                        popup.style.left = 'auto';
                        popup.style.right = '0';
                        popup.style.transform = 'none';
                        popup.querySelector('&::before').style.left = 'auto';
                        popup.querySelector('&::before').style.right = '20px';
                    }
                }
            });
            
            item.addEventListener('mouseleave', () => {
                const popup = item.querySelector('.service-description-popup');
                if (popup) popup.style.display = 'none';
            });
        });
    }

    if (window.innerWidth <= 768) {
        document.querySelectorAll('.service-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.order-btn')) {
                    item.classList.toggle('expanded');
                }
            });
        });
    }

    document.querySelectorAll('.order-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const serviceItem = this.closest('.service-item');
            const serviceName = serviceItem.querySelector('h4')?.textContent;
            const servicePrice = serviceItem.querySelector('.price')?.textContent;

            let tabId;
            document.querySelectorAll('.tab-button').forEach(button => {
                if (button.classList.contains('active')) {
                    tabId = button.getAttribute('data-tab');
                }
            });

            addToCart({
                name: serviceName,
                price: servicePrice,
                tab: tabId
            });
        });
    });
    document.querySelectorAll('.toggle-description-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const container = this.closest('.service-description-container');
            const short = container.querySelector('.service-description-short');
            const full = container.querySelector('.service-description-full');
            
            if (full.style.display === 'none') {
                short.style.display = 'none';
                full.style.display = 'block';
                this.textContent = 'Скрыть';
            } else {
                short.style.display = 'block';
                full.style.display = 'none';
                this.textContent = 'Подробнее';
            }
        });
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.stage-card').forEach(card => card.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-button[data-tab="${tabId}"]`).classList.add('active');
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
                switchTab(data.filters[0].toLowerCase());
            }
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
            filter: service.tab
        });
    }
    
    const mobileCartIcon = document.getElementById('mobileCartIcon');
    if (mobileCartIcon) {
        mobileCartIcon.classList.add('added');
        const badge = document.getElementById('mobileCartCount');
        if (badge) badge.classList.add('pulse');
        
        setTimeout(() => {
            mobileCartIcon.classList.remove('added');
            if (badge) badge.classList.remove('pulse');
        }, 500);
    }
    
    updateCartUI();
}

async function showQuestionsModal(filters, onComplete) {
    const filterSet = new Set(filters.map(f => f.toLowerCase()));

    fetch('/adminboard/get_questions')
    .then(response => response.json())
    .then(data => {
        if (!data.success) return;

        const questionsByFilter = {};

        data.questions.forEach(q => {
            const qFilterLower = q.filter_name.toLowerCase();
            if (filterSet.has(qFilterLower)) {
                if (!questionsByFilter[q.filter_name]) {
                    questionsByFilter[q.filter_name] = [];
                }
                questionsByFilter[q.filter_name].push(q);
            }
        });

        console.log("questionsByFilter:", questionsByFilter);
        if (Object.keys(questionsByFilter).length > 0) {
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
                                    q.answer_type === 'radio' ?
                                    `<div class="radio-group">
                                        <label><input type="radio" name="question-${q.id}" value="Да"> Да</label>
                                        <label><input type="radio" name="question-${q.id}" value="Нет"> Нет</label>
                                    </div>` :
                                    `<div class="checkbox-group">
                                        <label><input type="checkbox" name="question-${q.id}" value="Вариант 1"> Вариант 1</label>
                                        <label><input type="checkbox" name="question-${q.id}" value="Вариант 2"> Вариант 2</label>
                                    </div>`
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
                        let answer = '';
                        
                        if (q.answer_type === 'text') {
                            answer = answerElement.value;
                        } else if (q.answer_type === 'radio') {
                            const selected = document.querySelector(`input[name="question-${q.id}"]:checked`);
                            answer = selected ? selected.value : '';
                        } else if (q.answer_type === 'checkbox') {
                            const selected = Array.from(document.querySelectorAll(`input[name="question-${q.id}"]:checked`))
                                .map(el => el.value)
                                .join(', ');
                            answer = selected;
                        }
                        
                        if (q.is_required && !answer) {
                            isValid = false;
                            answerElement.classList.add('error');
                        } else {
                            if (answerElement) answerElement.classList.remove('error');
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
                
                if (cart.length > 0) {
                    cart[cart.length - 1].answers = answers;
                }
                
                modal.remove();
                if (typeof onComplete === 'function') {
                    onComplete();
                }
            });
            
            modal.style.display = 'flex';
        }
        else {
            onComplete();
        }
    });
    return true;
}

function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartUI();
}

function updateCartUI() {
    const cartItemsContainer = document.getElementById('cart-items');
    const mobileCartCount = document.getElementById('mobileCartCount');
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

    if (mobileCartCount) {
        mobileCartCount.textContent = cartCount.textContent;
    }
    
    proceedBtn.onclick = function() {
        document.querySelector('#order').scrollIntoView({ behavior: 'smooth' });
    };
}

const mobileCartIcon = document.getElementById('mobileCartIcon');
if (mobileCartIcon) {
    mobileCartIcon.addEventListener('click', () => {
        document.getElementById('order').scrollIntoView({
            behavior: 'smooth'
        });
        
        mobileCartIcon.style.transform = 'scale(0.9)';
        setTimeout(() => {
            mobileCartIcon.style.transform = 'scale(1)';
        }, 300);
    });
}


document.getElementById('order-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const uniqueFilters = [...new Set(cart.map(item => item.filter))];
    showQuestionsModal(uniqueFilters, proceedOrderSubmission);
});

function proceedOrderSubmission() {
    const allAnswers = [];
    cart.forEach(item => {
        if (item.answers && item.answers.length > 0) {
            allAnswers.push(...item.answers);
        }
    });

    const formData = {
        fullName: document.getElementById('full-name').value,
        phone: document.getElementById('phone').value,
        email: document.getElementById('email').value,
        comments: document.getElementById('comments').value,
        services: cart,
        consentPersonal: document.getElementById('consent-personal').checked,
        consentMarketing: document.getElementById('consent-marketing').checked,
        answers: allAnswers
    };

    if (!validateOrderForm(formData)) return;

    fetch('/submit_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showSuccessModal();
            cart = [];
            updateCartUI();
            document.getElementById('order-form').reset();
        } else {
            alert('Ошибка при отправке заявки: ' + data.message);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Произошла ошибка при отправке заявки');
    });
}


function validateOrderForm(formData) {
    if (!formData.fullName || !formData.phone || !formData.comments) {
        alert('Пожалуйста, заполните обязательные поля (ФИО и Телефон)');
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

// Мобильное меню
const menuToggle = document.getElementById('menuToggle');
const mainNav = document.getElementById('mainNav');

menuToggle.addEventListener('click', () => {
    mainNav.classList.toggle('active');
});

// Закрытие меню при клике на ссылку
document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', () => {
        mainNav.classList.remove('active');
    });
});

// Показать/скрыть материалы в услугах
document.querySelectorAll('.service-item').forEach(item => {
    const toggleBtn = document.createElement('span');
    toggleBtn.className = 'toggle-materials';
    toggleBtn.textContent = 'Показать материалы';
    item.querySelector('.service-info').appendChild(toggleBtn);
    
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const materials = item.querySelector('.materials');
        materials.classList.toggle('active');
        toggleBtn.textContent = materials.classList.contains('active') ? 'Скрыть материалы' : 'Показать материалы';
    });
});

// Адаптация табов услуг
const serviceTabs = document.getElementById('service-tabs');
if (serviceTabs) {
    const tabs = serviceTabs.querySelectorAll('.tab-button');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

