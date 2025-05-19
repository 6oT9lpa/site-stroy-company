document.querySelectorAll('.admin-menu a').forEach(menuItem => {
    menuItem.addEventListener('click', function(e) {
        e.preventDefault();
        
        document.querySelectorAll('.admin-menu a').forEach(item => {
            item.classList.remove('active');
        });
    
        this.classList.add('active');
        
        const sectionId = this.getAttribute('href').substring(1);
        loadSectionContent(sectionId);
        
        // Инициализация конкретной вкладки
        switch(sectionId) {
            case 'users':
                loadUsers();
                break;
            case 'communications':
                loadSubscribers();
                break;
            case 'dashboard':
                loadDashboardData();
                break;
            case 'orders':
                loadRequests();
                break;
            case 'services':
                loadServicesAndFilters();
                break;
        }
    });
});

let dashboardCharts = {
    requestsChart: null,
    statusChart: null
};

document.addEventListener('DOMContentLoaded', function() {
    loadServicesAndFilters();
    document.getElementById('service-search').addEventListener('input', function(e) {
        filterServices(e.target.value);
    });
    
    document.getElementById('add-service-btn').addEventListener('click', showAddServiceModal);
    document.getElementById('add-filter-btn').addEventListener('click', showAddFilterModal);
    document.getElementById('add-question-btn').addEventListener('click', showQuestionModal);
    
    initListManagement();

    const defaultSection = document.querySelector('.admin-menu a.active') || 
                        document.querySelector('.admin-menu a');
    if (defaultSection) {
        const sectionId = defaultSection.getAttribute('href').substring(1);
        loadSectionContent(sectionId);
    }

    document.getElementById('user-search').addEventListener('input', (e) => {
        loadUsers(e.target.value);
    });
    
    document.getElementById('add-user-btn').addEventListener('click', () => {
        showUserModal(false);
    });

    document.getElementById('subscriber-search').addEventListener('input', (e) => {
        loadSubscribers(e.target.value);
    });
    
    document.getElementById('send-newsletter-btn').addEventListener('click', () => {
        showNewsletterModal();
    });
});

function loadSectionContent(sectionId) {
    document.querySelectorAll('.admin-content').forEach(section =>{ 
        section.style.display = "none";
    });

    document.getElementById(sectionId).style.display = "grid";
}

function loadServicesAndFilters() {
    fetch('/adminboard/load_all_provide_service')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderFilters(data.filter_list);
                renderServices(data.all_services);
            } else {
                showNotification('Ошибка загрузки данных', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification('Ошибка загрузки данных', 'error');
        });
}

function renderFilters(filters) {
    const filtersList = document.getElementById('filters-list');
    filtersList.innerHTML = '';
    
    // Добавляем фильтр "Все"
    const allFilter = document.createElement('li');
    allFilter.textContent = 'Все';
    allFilter.classList.add('active');
    allFilter.addEventListener('click', () => {
        document.querySelectorAll('#filters-list li').forEach(li => li.classList.remove('active'));
        allFilter.classList.add('active');
        filterServicesByCategory(null);
    });
    filtersList.appendChild(allFilter);
    
    // Добавляем остальные фильтры
    filters.forEach(filter => {
        const filterItem = document.createElement('li');
        filterItem.textContent = filter.name;
        filterItem.dataset.filterId = filter.id;
        
        filterItem.addEventListener('click', () => {
            document.querySelectorAll('#filters-list li').forEach(li => li.classList.remove('active'));
            filterItem.classList.add('active');
            filterServicesByCategory(filter.id);
        });
        
        // Добавляем кнопки управления фильтром
        const actions = document.createElement('div');
        actions.className = 'filter-actions';
        actions.innerHTML = `
            <i class="fas fa-edit edit-filter" data-id="${filter.id}"></i>
            <i class="fas fa-trash delete-filter" data-id="${filter.id}"></i>
        `;
        filterItem.appendChild(actions);
        
        filtersList.appendChild(filterItem);
    });
    
    // Добавляем обработчики для кнопок управления фильтрами
    document.querySelectorAll('.edit-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showEditFilterModal(parseInt(e.target.dataset.id));
        });
    });
    
    document.querySelectorAll('.delete-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteFilter(parseInt(e.target.dataset.id));
        });
    });
}

function renderServices(services) {
    const servicesList = document.getElementById('services-list');
    servicesList.innerHTML = '';
    
    services.forEach(service => {
        const serviceCard = document.createElement('div');
        serviceCard.className = 'service-card';
        serviceCard.dataset.serviceId = service.id;
        serviceCard.dataset.filterId = service.filter_name;
        
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
        
        serviceCard.innerHTML = `
            <div class="service-header">
                <h4>${service.name}</h4>
                <div class="service-actions">
                    <button class="edit-service" data-id="${service.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-service" data-id="${service.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="service-details">
                <p><strong>Стоимость:</strong> от ${service.cost}</p>
                ${service.duraction_work ? `<p><strong>Срок выполнения:</strong> от ${service.duraction_work}</p>` : ''}
                ${materialsHtml}
                ${includedHtml}
            </div>
        `;
        
        servicesList.appendChild(serviceCard);
    });
    
    document.querySelectorAll('.edit-service').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showEditServiceModal(parseInt(e.target.closest('button').dataset.id));
        });
    });
    
    document.querySelectorAll('.delete-service').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteService(parseInt(e.target.closest('button').dataset.id));
        });
    });
}

function filterServices(searchTerm) {
    const services = document.querySelectorAll('.service-card');
    const activeFilter = document.querySelector('#filters-list li.active');
    const filterId = activeFilter.dataset.filterId || null;
    
    services.forEach(service => {
        const serviceName = service.querySelector('h4').textContent.toLowerCase();
        const serviceFilterId = service.dataset.filterId;
        
        const matchesSearch = serviceName.includes(searchTerm.toLowerCase());
        const matchesFilter = filterId === null || serviceFilterId === filterId;
        
        if (matchesSearch && matchesFilter) {
            service.style.display = 'block';
        } else {
            service.style.display = 'none';
        }
    });
}

function filterServicesByCategory(filterId) {
    const searchTerm = document.getElementById('service-search').value;
    filterServices(searchTerm);
}

// Обработчики закрытия модальных окон
document.querySelectorAll('.close-modal, .cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
    });
});

// Обработчик клика вне модального окна
window.addEventListener('click', (e) => {
    if (e.target.className === 'modal') {
        e.target.style.display = 'none';
    }
});

function initListManagement() {
    document.getElementById('add-material-btn').addEventListener('click', function() {
        const container = document.getElementById('materials-container');
        addListItem(container, 'material');
    });
    
    document.getElementById('add-included-service-btn').addEventListener('click', function() {
        const container = document.getElementById('included-services-container');
        addListItem(container, 'service');
    });
}

function addListItem(container, type) {
    const itemId = Date.now();
    const newItem = document.createElement('div');
    newItem.className = 'list-item';
    newItem.dataset.id = itemId;
    
    if (type === 'material') {
        newItem.innerHTML = `
            <div class="toggle-container">
                <input type="checkbox" id="material-active-${itemId}" checked>
                <label for="material-active-${itemId}">Активен</label>
            </div>
            <input type="text" placeholder="Название материала" class="item-input">
            <div class="item-actions">
                <button class="remove-item"><i class="fas fa-trash"></i></button>
            </div>
        `;
    } else {
        newItem.innerHTML = `
            <input type="text" placeholder="Название услуги" class="item-input">
            <div class="item-actions">
                <button class="remove-item"><i class="fas fa-trash"></i></button>
            </div>
        `;
    }
    
    container.appendChild(newItem);
    
    newItem.querySelector('.remove-item').addEventListener('click', function() {
        container.removeChild(newItem);
    });
}

function getListItems(container, isMaterial = false) {
    const items = [];
    container.querySelectorAll('.list-item').forEach(item => {
        const input = item.querySelector('.item-input').value;
        if (input) {
            if (isMaterial) {
                const active = item.querySelector('input[type="checkbox"]').checked;
                items.push({
                    active: active,
                    name: input
                });
            } else {
                items.push(input);
            }
        }
    });
    return items;
}

function showAddServiceModal() {
    const modal = document.getElementById('add-service-modal');
    modal.style.display = 'flex';
    modal.querySelector('h3').textContent = 'Добавить услугу';
    
    document.getElementById('service-name').value = '';
    document.getElementById('service-description').value = '';
    document.getElementById('service-cost').value = '';
    document.getElementById('cost-type').value = 'руб';
    document.getElementById('service-duration').value = '';
    document.getElementById('materials-container').innerHTML = '';
    document.getElementById('included-services-container').innerHTML = '';
    
    fetch('/adminboard/load_all_provide_service')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const select = document.getElementById('service-filter');
                select.innerHTML = '';
                
                data.filter_list.forEach(filter => {
                    const option = document.createElement('option');
                    option.value = filter.id;
                    option.textContent = filter.name;
                    select.appendChild(option);
                });
            }
        });
    
    // Обработчик сохранения
    modal.querySelector('.save-btn').onclick = () => {
        const serviceData = {
            name: document.getElementById('service-name').value,
            description: document.getElementById('service-description').value,
            filter_name: document.getElementById('service-filter').value,
            cost: parseFloat(document.getElementById('service-cost').value) + ' ' + 
                document.getElementById('cost-type').value,
            duraction_work: document.getElementById('service-duration').value,
            materials: getListItems(document.getElementById('materials-container'), true),
            include_service: getListItems(document.getElementById('included-services-container'))
        };
        
        if (!serviceData.name || !serviceData.filter_name || isNaN(parseFloat(document.getElementById('service-cost').value))) {
            showNotification('Заполните обязательные поля', 'error');
            return;
        }
        
        fetch('/adminboard/add_service', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(serviceData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Услуга успешно добавлена', 'success');
                loadServicesAndFilters();
                modal.style.display = 'none';
            } else {
                showNotification(data.message || 'Ошибка при добавлении услуги', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification('Ошибка при добавлении услуги', 'error');
        });
    };
}

function showAddFilterModal() {
    const modal = document.getElementById('add-filter-modal');
    modal.style.display = 'flex';
    
    // Обработчик сохранения фильтра
    modal.querySelector('.save-btn').onclick = () => {
        const filterName = document.getElementById('filter-name').value;
        
        if (!filterName) {
            showNotification('Введите название фильтра', 'error');
            return;
        }
        
        fetch('/adminboard/add_filter', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: filterName })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Фильтр успешно добавлен', 'success');
                loadServicesAndFilters();
                modal.style.display = 'none';
            } else {
                showNotification(data.message || 'Ошибка при добавлении фильтра', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification('Ошибка при добавлении фильтра', 'error');
        });
    };
}

function showEditServiceModal(serviceId) {
    fetch(`/adminboard/get_service/${serviceId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const service = data.service;
                const modal = document.getElementById('add-service-modal');
                modal.querySelector('h3').textContent = 'Редактировать услугу';
                modal.style.display = 'flex';
                
                // Заполняем основные поля
                document.getElementById('service-name').value = service.name;
                document.getElementById('service-description').value = service.description;
                const costParts = service.cost.split(' ');
                const costValue = parseFloat(costParts[0]);
                const costType = costParts.slice(1).join(' ') || 'руб';
                document.getElementById('service-cost').value = isNaN(costValue) ? '' : costValue;
                document.getElementById('cost-type').value = costType;
                
                document.getElementById('service-duration').value = service.duraction_work || '';
                document.getElementById('service-duration').value = service.duraction_work || '';
                
                const materialsContainer = document.getElementById('materials-container');
                materialsContainer.innerHTML = '';
                
                if (service.materials && Array.isArray(service.materials)) {
                    service.materials.forEach(material => {
                        const itemId = Date.now();
                        const materialItem = document.createElement('div');
                        materialItem.className = 'list-item';
                        materialItem.dataset.id = itemId;
                        materialItem.innerHTML = `
                            <div class="toggle-container">
                                <input type="checkbox" id="material-active-${itemId}" ${material.active ? 'checked' : ''}>
                                <label for="material-active-${itemId}">Активен</label>
                            </div>
                            <input type="text" value="${material.name}" placeholder="Название материала" class="item-input">
                            <div class="item-actions">
                                <button class="remove-item"><i class="fas fa-trash"></i></button>
                            </div>
                        `;
                        materialsContainer.appendChild(materialItem);
                        
                        materialItem.querySelector('.remove-item').addEventListener('click', function() {
                            materialsContainer.removeChild(materialItem);
                        });
                    });
                }
                
                // Обрабатываем включенные услуги
                const includedContainer = document.getElementById('included-services-container');
                includedContainer.innerHTML = '';
                
                if (service.include_service && Array.isArray(service.include_service)) {
                    service.include_service.forEach(serviceName => {
                        const itemId = Date.now();
                        const serviceItem = document.createElement('div');
                        serviceItem.className = 'list-item';
                        serviceItem.dataset.id = itemId;
                        serviceItem.innerHTML = `
                            <input type="text" value="${serviceName}" placeholder="Название услуги" class="item-input">
                            <div class="item-actions">
                                <button class="remove-item"><i class="fas fa-trash"></i></button>
                            </div>
                        `;
                        includedContainer.appendChild(serviceItem);
                        
                        serviceItem.querySelector('.remove-item').addEventListener('click', function() {
                            includedContainer.removeChild(serviceItem);
                        });
                    });
                }
                
                // Загружаем список фильтров и выбираем текущий
                fetch('/adminboard/load_all_provide_service')
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            const select = document.getElementById('service-filter');
                            select.innerHTML = '';
                            
                            data.filter_list.forEach(filter => {
                                const option = document.createElement('option');
                                option.value = filter.id;
                                option.textContent = filter.name;
                                option.selected = filter.id === service.filter_name;
                                select.appendChild(option);
                            });
                        }
                    });
                
                // Обработчик сохранения изменений
                modal.querySelector('.save-btn').onclick = () => {
                    const serviceData = {
                        id: serviceId,
                        name: document.getElementById('service-name').value,
                        description: document.getElementById('service-description').value,
                        filter_name: document.getElementById('service-filter').value,
                        cost: parseFloat(document.getElementById('service-cost').value) + ' ' + 
                            document.getElementById('cost-type').value,
                        duraction_work: document.getElementById('service-duration').value,
                        materials: getListItems(document.getElementById('materials-container'), true),
                        include_service: getListItems(document.getElementById('included-services-container'))
                    };
                    
                    if (!serviceData.name || !serviceData.filter_name || isNaN(parseFloat(document.getElementById('service-cost').value))) {
                        showNotification('Заполните обязательные поля', 'error');
                        return;
                    }
                    
                    fetch('/adminboard/update_service', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(serviceData)
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            showNotification('Услуга успешно обновлена', 'success');
                            loadServicesAndFilters();
                            modal.style.display = 'none';
                        } else {
                            showNotification(data.message || 'Ошибка при обновлении услуги', 'error');
                        }
                    })
                    .catch(error => {
                        console.error('Error:', error);
                        showNotification('Ошибка при обновлении услуги', 'error');
                    });
                };
            } else {
                showNotification(data.message || 'Ошибка загрузки данных услуги', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification('Ошибка загрузки данных услуги', 'error');
        });
}

function showEditFilterModal(filterId) {
    fetch(`/adminboard/get_filter/${filterId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const filter = data.filter;
                const modal = document.getElementById('add-filter-modal');
                modal.querySelector('h3').textContent = 'Редактировать фильтр';
                modal.style.display = 'flex';
                
                document.getElementById('filter-name').value = filter.name;
                
                // Обработчик сохранения изменений
                modal.querySelector('.save-btn').onclick = () => {
                    const filterData = {
                        id: filterId,
                        name: document.getElementById('filter-name').value
                    };
                    
                    if (!filterData.name) {
                        showNotification('Введите название фильтра', 'error');
                        return;
                    }
                    
                    fetch('/adminboard/update_filter', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(filterData)
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            showNotification('Фильтр успешно обновлен', 'success');
                            loadServicesAndFilters();
                            modal.style.display = 'none';
                        } else {
                            showNotification(data.message || 'Ошибка при обновлении фильтра', 'error');
                        }
                    })
                    .catch(error => {
                        console.error('Error:', error);
                        showNotification('Ошибка при обновлении фильтра', 'error');
                    });
                };
            } else {
                showNotification(data.message || 'Ошибка загрузки данных фильтра', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification('Ошибка загрузки данных фильтра', 'error');
        });
}

function deleteService(serviceId) {
    if (!confirm('Вы уверены, что хотите удалить эту услугу?')) return;
    
    fetch(`/adminboard/delete_service/${serviceId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('Услуга успешно удалена', 'success');
            loadServicesAndFilters();
        } else {
            showNotification(data.message || 'Ошибка при удалении услуги', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Ошибка при удалении услуги', 'error');
    });
}

function deleteFilter(filterId) {
    if (!confirm('Вы уверены, что хотите удалить этот фильтр? Все услуги будут перемещены в категорию "Другие".')) return;
    
    fetch(`/adminboard/delete_filter/${filterId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('Фильтр успешно удален', 'success');
            loadServicesAndFilters();
        } else {
            showNotification(data.message || 'Ошибка при удалении фильтра', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Ошибка при удалении фильтра', 'error');
    });
}

function loadRequests() {
    fetch('/adminboard/get_requests')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderRecentRequests(data.requests);
            } else {
                showNotification('Ошибка загрузки заявок', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification('Ошибка загрузки заявок', 'error');
        });
}

function showRequestDetails(requestId) {
    fetch(`/adminboard/get_request/${requestId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const request = data.request;
                const modal = document.getElementById('request-details-modal');
                
                document.getElementById('request-id').textContent = requestId;
                
                // Форматируем дату
                const createdAt = new Date(request.created_at);
                const formattedDate = createdAt.toLocaleDateString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                // Форматируем услуги
                let servicesHtml = '';
                if (request.services && request.services.length > 0) {
                    servicesHtml = request.services.map(service => `
                        <div class="service">${service.name}</div>
                    `).join('');
                }
                
                document.getElementById('request-details-body').innerHTML = `
                    <div class="request-details-item">
                        <strong>Статус:</strong>
                        <span class="request-status">${request.status}</span>
                    </div>
                    <div class="request-details-item">
                        <strong>Дата создания:</strong>
                        <span>${formattedDate}</span>
                    </div>
                    <div class="request-details-item">
                        <strong>ФИО:</strong>
                        <span>${request.full_name}</span>
                    </div>
                    <div class="request-details-item">
                        <strong>Телефон:</strong>
                        <span>${request.phone}</span>
                    </div>
                    <div class="request-details-item">
                        <strong>Email:</strong>
                        <span>${request.email}</span>
                    </div>
                    <div class="request-details-item">
                        <strong>Услуги:</strong>
                        <div class="request-services">${servicesHtml}</div>
                    </div>
                    <div class="request-details-item">
                        <strong>Комментарии:</strong>
                        <p>${request.comments || 'Нет комментариев'}</p>
                    </div>
                `;
                
                modal.style.display = 'flex';
            } else {
                showNotification(data.message || 'Ошибка загрузки данных заявки', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification('Ошибка загрузки данных заявки', 'error');
        });
}

document.getElementById('status-filter').addEventListener('change', filterRequests);
document.getElementById('request-search').addEventListener('input', filterRequests);

function filterRequests() {
    const statusFilter = document.getElementById('status-filter').value;
    const searchTerm = document.getElementById('request-search').value.toLowerCase();
    
    document.querySelectorAll('.request-card').forEach(card => {
        const cardStatus = card.dataset.status;
        const cardText = card.textContent.toLowerCase();
        
        const statusMatch = statusFilter === 'all' || cardStatus === statusFilter;
        const searchMatch = searchTerm === '' || cardText.includes(searchTerm);
        
        card.style.display = (statusMatch && searchMatch) ? 'block' : 'none';
    });
}


function loadDashboardData() {
    fetch('/adminboard/dashboard_stats')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                updateStatsCards(data.stats);
                renderCharts(data.chartData);
            } else {
                showNotification('Ошибка загрузки статистики', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification('Ошибка загрузки статистики', 'error');
        });
}

function updateStatsCards(stats) {
    document.getElementById('visitors-count').textContent = stats.visitors.toLocaleString();
    document.getElementById('total-requests').textContent = stats.totalRequests.toLocaleString();
    document.getElementById('completed-requests').textContent = stats.completedRequests.toLocaleString();
    document.getElementById('in-progress-requests').textContent = stats.inProgressRequests.toLocaleString();
    document.getElementById('rejected-requests').textContent = stats.rejectedRequests.toLocaleString();
    
    updateChangeIndicator('visitors-change', stats.visitorsChange);
    updateChangeIndicator('requests-change', stats.requestsChange);
    
    document.getElementById('completed-percent').textContent = stats.completedPercent + '%';
    document.getElementById('in-progress-percent').textContent = stats.inProgressPercent + '%';
    document.getElementById('rejected-percent').textContent = stats.rejectedPercent + '%';
}

function updateChangeIndicator(elementId, change) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const isPositive = change >= 0;
    const prefix = isPositive ? '+' : '';
    
    element.textContent = `${prefix}${change}% за период`;
    element.className = isPositive ? 'stat-change positive' : 'stat-change negative';
}

function renderCharts(chartData) {
    if (dashboardCharts.requestsChart) {
        dashboardCharts.requestsChart.destroy();
    }
    if (dashboardCharts.statusChart) {
        dashboardCharts.statusChart.destroy();
    }

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: isMobile ? 'top' : 'right',
                labels: {
                    boxWidth: 12,
                    padding: 20,
                    font: {
                        size: isMobile ? 10 : 12
                    }
                }
            }
        }
    };

    const requestsCtx = document.getElementById('requests-chart').getContext('2d');
    dashboardCharts.requestsChart = new Chart(requestsCtx, {
        type: 'line',
        data: {
            labels: chartData.requestsByDay.labels,
            datasets: [{
                label: 'Количество заявок',
                data: chartData.requestsByDay.data,
                backgroundColor: 'rgba(78, 115, 223, 0.05)',
                borderColor: 'rgba(78, 115, 223, 1)',
                borderWidth: 2,
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        font: {
                            size: isMobile ? 10 : 12
                        }
                    },
                    grid: {
                        display: true,
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    ticks: {
                        font: {
                            size: isMobile ? 10 : 12
                        },
                        maxRotation: isMobile ? 45 : 0,
                        autoSkip: true,
                        maxTicksLimit: isMobile ? 5 : 10
                    },
                    grid: {
                        display: false
                    }
                }
            },
            plugins: {
                tooltip: {
                    enabled: !isMobile,
                    mode: 'index',
                    intersect: false
                }
            }
        }
    });

    const statusCtx = document.getElementById('status-chart').getContext('2d');
    dashboardCharts.statusChart = new Chart(statusCtx, {
        type: 'doughnut',
        data: {
            labels: chartData.requestsByStatus.labels,
            datasets: [{
                data: chartData.requestsByStatus.data,
                backgroundColor: [
                    'rgba(78, 115, 223, 0.8)',
                    'rgba(28, 200, 138, 0.8)',
                    'rgba(246, 194, 62, 0.8)',
                    'rgba(231, 74, 59, 0.8)',
                    'rgba(110, 66, 193, 0.8)'
                ],
                borderWidth: 1,
                cutout: isMobile ? '60%' : '70%'
            }]
        },
        options: {
            ...commonOptions,
            plugins: {
                datalabels: {
                    display: !isMobile,
                    formatter: (value) => {
                        return value > 5 ? `${value}%` : '';
                    },
                    color: '#fff',
                    font: {
                        weight: 'bold'
                    }
                }
            }
        }
    });

    window.addEventListener('resize', function() {
        if (dashboardCharts.requestsChart) {
            dashboardCharts.requestsChart.resize();
        }
        if (dashboardCharts.statusChart) {
            dashboardCharts.statusChart.resize();
        }
    });
}

function renderRecentRequests(requests) {
    const table = document.getElementById('recent-requests-table');
    table.innerHTML = '';
    
    const tableEl = document.createElement('table');
    tableEl.className = 'requests-table';
    
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>ID</th>
            <th>Дата</th>
            <th>Клиент</th>
            <th>Телефон</th>
            <th>Услуги</th>
            <th>Статус</th>
            <th>Сумма</th>
        </tr>
    `;
    tableEl.appendChild(thead);
    
    // Тело таблицы
    const tbody = document.createElement('tbody');
    requests.forEach(request => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${request.id.substring(0, 8)}</td>
            <td>${new Date(request.created_at).toLocaleDateString()}</td>
            <td>${request.full_name}</td>
            <td>${request.phone}</td>
            <td>${request.services.length} услуг</td>
            <td><span class="status-badge status-${getStatusClass(request.status)}">${request.status}</span></td>
            <td>${request.total_price ? Math.round(request.total_price) + ' руб.' : '-'}</td>
        `;
        tr.addEventListener('click', () => showRequestDetails(request.id));
        tr.style.cursor = 'pointer';
        tbody.appendChild(tr);
    });
    tableEl.appendChild(tbody);
    
    table.appendChild(tableEl);
}

function getStatusClass(status) {
    switch(status) {
        case 'Новая': return 'new';
        case 'В рассмотрении': return 'review';
        case 'В работе': return 'in-progress';
        case 'Завершена': return 'completed';
        default: return '';
    }
}

document.querySelectorAll('.services-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        const tabId = this.dataset.tab;
        
        document.querySelectorAll('.services-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        
        if (tabId === 'services') {
            document.getElementById('services-section').style.display = 'grid';
            document.getElementById('services-tabs').style.display = "none";
            document.getElementById('add-service-btn').style.display = "flex";
            document.getElementById('add-question-btn').style.display = "none";
            document.getElementById('questions-section').style.display = 'none';
            document.getElementById('questions-tabs').style.display = "flex"
        } else {
            document.getElementById('services-section').style.display = 'none';
            document.getElementById('services-tabs').style.display = "flex";
            document.getElementById('add-service-btn').style.display = "none";
            document.getElementById('add-question-btn').style.display = "flex";
            document.getElementById('questions-section').style.display = 'grid';
            document.getElementById('questions-tabs').style.display = "none"
            loadQuestions();
        }
    });
});

document.getElementById('add-question-btn').addEventListener('click', function() {
    const modal = document.getElementById('question-modal');
    modal.style.display = 'flex';
    modal.querySelector('h3').textContent = 'Добавить вопрос';
    
    // Заполнить фильтры
    const filterSelect = document.getElementById('question-filter');
    filterSelect.innerHTML = '';
    
    fetch('/adminboard/load_all_provide_service')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                data.filter_list.forEach(filter => {
                    const option = document.createElement('option');
                    option.value = filter.id;
                    option.textContent = filter.name;
                    filterSelect.appendChild(option);
                });
            }
        });
    
    // Очистить остальные поля
    document.getElementById('question-text').value = '';
    document.getElementById('question-type').value = 'text';
    document.getElementById('question-required').checked = false;
});

function loadQuestions() {
    fetch('/adminboard/get_questions')
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            renderQuestions(data.questions);
        }
    });
}

function renderQuestions(questions) {
    const container = document.getElementById('questions-list');
    container.innerHTML = '';
    
    if (questions.length === 0) {
        container.innerHTML = '<p class="empty-message">Нет вопросов</p>';
        return;
    }
    
    // Группируем вопросы по фильтрам
    const questionsByFilter = {};
    questions.forEach(q => {
        if (!questionsByFilter[q.filter_name]) {
            questionsByFilter[q.filter_name] = [];
        }
        questionsByFilter[q.filter_name].push(q);
    });
    
    // Создаем аккордеон для каждого фильтра
    for (const [filterName, filterQuestions] of Object.entries(questionsByFilter)) {
        const filterAccordion = document.createElement('div');
        filterAccordion.className = 'filter-accordion';
        filterAccordion.innerHTML = `
            <div class="filter-accordion-header">
                <h4>${filterName}</h4>
                <i class="fas fa-chevron-down"></i>
            </div>
            <div class="filter-accordion-content">
                ${filterQuestions.map(q => `
                    <div class="question-item" data-id="${q.id}">
                        <div class="question-header">
                            <h5>${q.question_text}</h5>
                            <div class="question-actions">
                                <button class="edit-question" data-id="${q.id}">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="delete-question" data-id="${q.id}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        <div class="question-details">
                            <p><strong>Тип ответа:</strong> ${getAnswerTypeName(q.answer_type)}</p>
                            <p><strong>Обязательный:</strong> ${q.is_required ? 'Да' : 'Нет'}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        container.appendChild(filterAccordion);
        
        // Обработчик клика на заголовок аккордеона
        const header = filterAccordion.querySelector('.filter-accordion-header');
        const content = filterAccordion.querySelector('.filter-accordion-content');
        const icon = filterAccordion.querySelector('.filter-accordion-header i');
        
        header.addEventListener('click', () => {
            const isOpen = content.style.display === 'block';
            content.style.display = isOpen ? 'none' : 'block';
            icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
        });
    }
    
    // Обработчики для кнопок редактирования и удаления
    document.querySelectorAll('.edit-question').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const questionId = e.currentTarget.dataset.id;
            editQuestionModal(questionId);
        });
    });
    
    document.querySelectorAll('.delete-question').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const questionId = e.currentTarget.dataset.id;
            deleteQuestion(questionId);
        });
    });
}

function getAnswerTypeName(type) {
    const types = {
        'text': 'Текстовое поле',
        'radio': 'Один вариант',
        'checkbox': 'Несколько вариантов'
    };
    return types[type] || type;
}

function showQuestionModal() {
    const modal = document.getElementById('question-modal');
    modal.style.display = 'flex';
    
    const isEdit = modal.dataset.id;
    modal.querySelector('h3').textContent = isEdit ? 'Редактировать вопрос' : 'Добавить вопрос';
    
    // Очищаем поля
    document.getElementById('question-text').value = '';
    document.getElementById('question-type').value = 'text';
    document.getElementById('question-required').checked = false;
    
    // Заполняем фильтры
    fetch('/adminboard/load_all_provide_service')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const select = document.getElementById('question-filter');
                select.innerHTML = '';
                
                data.filter_list.forEach(filter => {
                    const option = document.createElement('option');
                    option.value = filter.id;
                    option.textContent = filter.name;
                    select.appendChild(option);
                });
            }
        });
    
    // Обработчик сохранения
    modal.querySelector('.save-btn').onclick = () => {
        const questionData = {
            filter_id: document.getElementById('question-filter').value,
            question_text: document.getElementById('question-text').value,
            answer_type: document.getElementById('question-type').value,
            is_required: document.getElementById('question-required').checked
        };
        
        if (!questionData.question_text) {
            showNotification('Введите текст вопроса', 'error');
            return;
        }
        
        const url = modal.dataset.id ? 
            '/adminboard/update_question' : 
            '/adminboard/add_question';
            
        const method = modal.dataset.id ? 'POST' : 'PUT';
        
        if (modal.dataset.id) {
            questionData.id = modal.dataset.id;
        }
        
        fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(questionData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification(modal.dataset.id ? 'Вопрос обновлен' : 'Вопрос сохранен', 'success');
                loadQuestions();
                modal.style.display = 'none';
                delete modal.dataset.id;
            } else {
                showNotification(data.message || 'Ошибка сохранения', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification('Ошибка сохранения вопроса', 'error');
        });
    };
}

function editQuestionModal(questionId) {
    fetch(`/adminboard/get_question/${questionId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const question = data.question;
                const modal = document.getElementById('question-modal');
                modal.style.display = 'flex';
                modal.querySelector('h3').textContent = 'Редактировать вопрос';
                modal.dataset.id = questionId;
                
                document.getElementById('question-text').value = question.question_text;
                document.getElementById('question-type').value = question.answer_type;
                document.getElementById('question-required').checked = question.is_required;
                
                // Заполняем фильтры
                fetch('/adminboard/load_all_provide_service')
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            const select = document.getElementById('question-filter');
                            select.innerHTML = '';
                            
                            data.filter_list.forEach(filter => {
                                const option = document.createElement('option');
                                option.value = filter.id;
                                option.textContent = filter.name;
                                option.selected = filter.id === question.filter_id;
                                select.appendChild(option);
                            });
                        }
                    });
                
                // Обновляем обработчик сохранения
                modal.querySelector('.save-btn').onclick = () => {
                    const questionData = {
                        id: questionId,
                        filter_id: document.getElementById('question-filter').value,
                        question_text: document.getElementById('question-text').value,
                        answer_type: document.getElementById('question-type').value,
                        is_required: document.getElementById('question-required').checked
                    };
                    
                    if (!questionData.question_text) {
                        showNotification('Введите текст вопроса', 'error');
                        return;
                    }
                    
                    fetch('/adminboard/update_question', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(questionData)
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            showNotification('Вопрос обновлен', 'success');
                            loadQuestions();
                            modal.style.display = 'none';
                        } else {
                            showNotification(data.message || 'Ошибка обновления', 'error');
                        }
                    })
                    .catch(error => {
                        console.error('Error:', error);
                        showNotification('Ошибка обновления вопроса', 'error');
                    });
                };
            } else {
                showNotification(data.message || 'Ошибка загрузки вопроса', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification('Ошибка загрузки вопроса', 'error');
        });
}

function deleteQuestion(questionId) {
    if (!confirm('Вы уверены, что хотите удалить этот вопрос?')) return;
    
    fetch(`/adminboard/delete_question/${questionId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('Вопрос удален', 'success');
            loadQuestions();
        } else {
            showNotification(data.message || 'Ошибка удаления', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Ошибка удаления вопроса', 'error');
    });
}

function loadUsers(search = '') {
    fetch(`/adminboard/get_users?search=${encodeURIComponent(search)}`)
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            renderUsers(data.users, data.roles);
        } else {
            showNotification(data.message || 'Ошибка загрузки пользователей', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Ошибка загрузки пользователей', 'error');
    });
}

function renderUsers(users, roles) {
    const usersList = document.getElementById('users-list');
    usersList.innerHTML = '';
    
    if (users.length === 0) {
        usersList.innerHTML = '<tr><td colspan="8" class="empty-table">Нет пользователей</td></tr>';
        return;
    }
    
    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.dataset.id = user.id;
        
        const statusClass = user.is_blocked ? 'blocked' : (user.is_active ? 'active' : 'inactive');
        const statusText = user.is_blocked ? 'Заблокирован' : (user.is_active ? 'Активен' : 'Неактивен');
        
        tr.innerHTML = `
            <td>${user.username}</td>
            <td>${user.email}</td>
            <td>${user.first_name || '-'}</td>
            <td>${user.last_name || '-'}</td>
            <td>${user.role_name}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>${user.last_activity ? new Date(user.last_activity).toLocaleString() : 'Никогда'}</td>
            <td class="actions">
                <button class="edit-user" data-id="${user.id}"><i class="fas fa-edit"></i></button>
                <button class="delete-user" data-id="${user.id}"><i class="fas fa-trash"></i></button>
            </td>
        `;
        
        usersList.appendChild(tr);
    });
    
    // Обработчики для кнопок
    document.querySelectorAll('.edit-user').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const userId = e.currentTarget.dataset.id;
            showEditUserModal(userId);
        });
    });
    
    document.querySelectorAll('.delete-user').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const userId = e.currentTarget.dataset.id;
            deleteUser(userId);
        });
    });
}

function showUserModal(isEdit = false, userData = null) {
    const modal = document.getElementById('user-modal');
    modal.style.display = 'flex';
    
    const title = modal.querySelector('h3');
    const passwordField = document.getElementById('user-password');
    const passwordLabel = document.getElementById('password-label');
    
    if (isEdit) {
        title.textContent = 'Редактировать пользователя';
        passwordField.required = false;
        passwordLabel.textContent = 'Пароль (оставьте пустым, чтобы не изменять)';
        modal.dataset.id = userData.id;
        
        // Заполняем поля данными пользователя
        document.getElementById('user-username').value = userData.username;
        document.getElementById('user-email').value = userData.email;
        document.getElementById('user-first-name').value = userData.first_name || '';
        document.getElementById('user-last-name').value = userData.last_name || '';
        document.getElementById('user-active').checked = userData.is_active && !userData.is_blocked;
        passwordField.value = '';
    } else {
        title.textContent = 'Добавить пользователя';
        passwordField.required = true;
        passwordLabel.textContent = 'Пароль*';
        delete modal.dataset.id;
        
        // Очищаем поля
        document.getElementById('user-username').value = '';
        document.getElementById('user-email').value = '';
        document.getElementById('user-first-name').value = '';
        document.getElementById('user-last-name').value = '';
        document.getElementById('user-password').value = '';
        document.getElementById('user-active').checked = true;
    }
    
    // Заполняем роли
    fetch('/adminboard/get_users')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const roleSelect = document.getElementById('user-role');
                roleSelect.innerHTML = '';
                
                data.roles.forEach(role => {
                    const option = document.createElement('option');
                    option.value = role.id;
                    option.textContent = role.name;
                    
                    if (isEdit && userData.role_id == role.id) {
                        option.selected = true;
                    }
                    
                    roleSelect.appendChild(option);
                });
            }
        });
    
    // Обработчик сохранения
    modal.querySelector('.save-btn').onclick = () => {
        const userData = {
            username: document.getElementById('user-username').value,
            email: document.getElementById('user-email').value,
            first_name: document.getElementById('user-first-name').value || null,
            last_name: document.getElementById('user-last-name').value || null,
            role_id: document.getElementById('user-role').value,
            is_active: document.getElementById('user-active').checked
        };
        
        const password = document.getElementById('user-password').value;
        if (password) {
            userData.password = password;
        }
        
        if (!userData.username || !userData.email || !userData.role_id || (!isEdit && !password)) {
            showNotification('Заполните обязательные поля', 'error');
            return;
        }
        
        const url = isEdit ? '/adminboard/update_user' : '/adminboard/add_user';
        const method = isEdit ? 'POST' : 'POST';
        
        if (isEdit) {
            userData.id = modal.dataset.id;
        }
        
        fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(userData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification(isEdit ? 'Пользователь обновлен' : 'Пользователь добавлен', 'success');
                loadUsers();
                modal.style.display = 'none';
            } else {
                showNotification(data.message || 'Ошибка сохранения', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification('Ошибка сохранения пользователя', 'error');
        });
    };
}

// Удаление пользователя
function deleteUser(userId) {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) return;
    
    fetch(`/adminboard/delete_user/${userId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showNotification('Пользователь удален', 'success');
            loadUsers();
        } else {
            showNotification(data.message || 'Ошибка удаления', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification('Ошибка удаления пользователя', 'error');
    });
}

// Функции для работы с рассылками
function loadSubscribers(search = '') {
    fetch(`/adminboard/get_subscribers?search=${encodeURIComponent(search)}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                renderSubscribers(data.subscribers);
            } else {
                showNotification(data.message || 'Ошибка загрузки подписчиков', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification('Ошибка загрузки подписчиков', 'error');
        });
}

function renderSubscribers(subscribers) {
    const subscribersList = document.getElementById('subscribers-list');
    subscribersList.innerHTML = '';
    
    if (subscribers.length === 0) {
        subscribersList.innerHTML = '<tr><td colspan="5" class="empty-table">Нет подписчиков</td></tr>';
        return;
    }
    
    subscribers.forEach(subscriber => {
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td>${subscriber.email}</td>
            <td>${subscriber.full_name || '-'}</td>
            <td>${subscriber.phone || '-'}</td>
            <td>${subscriber.last_activity ? new Date(subscriber.last_activity).toLocaleString() : 'Никогда'}</td>
            <td><span class="status-badge active">Подписан</span></td>
        `;
        
        subscribersList.appendChild(tr);
    });
}

function showNewsletterModal() {
    const modal = document.getElementById('newsletter-modal');
    modal.style.display = 'flex';
    
    // Очищаем поля
    document.getElementById('newsletter-subject').value = '';
    document.getElementById('newsletter-content').value = '';
    
    // Обработчик отправки
    modal.querySelector('.send-btn').onclick = () => {
        const subject = document.getElementById('newsletter-subject').value;
        const content = document.getElementById('newsletter-content').value;
        
        if (!subject || !content) {
            showNotification('Заполните все обязательные поля', 'error');
            return;
        }
        
        fetch('/adminboard/send_newsletter', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                subject: subject,
                content: content
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Рассылка отправлена', 'success');
                modal.style.display = 'none';
            } else {
                showNotification(data.message || 'Ошибка отправки', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification('Ошибка отправки рассылки', 'error');
        });
    };
}
